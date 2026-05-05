import type { Locator, Page } from 'playwright';
import type { CheckResult, TrackContext, TrackMode } from '../types.js';
import type { SiteAdapter } from '../types.js';

const UNIQLO_HOST = 'www.uniqlo.com';
const UNIQLO_MY_PATH = '/my/';

/**
 * Heuristic selectors: Zara’s class names and DOM change. Re-verify against a live MY PDP
 * (product detail page) and adjust; see money-amount patterns on Zara’s global site.
 */
const PRICE_MAIN =
  ".money-amount__main, [class*='money-amount__main'], [class*='price']";
const OLD_PRICE =
  ".money-amount__old, [class*='money-amount__old'], [class*='line-through']";

function parseLocalePrice(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function readCurrentPriceText(page: Page): Promise<string | undefined> {
  const main = page.locator(PRICE_MAIN).first();
  if (await main.isVisible().catch(() => false)) {
    return parseLocalePrice((await main.innerText()) ?? '');
  }
  return undefined;
}

async function hasStrikethroughOrOldPrice(page: Page): Promise<boolean> {
  const old = page.locator(OLD_PRICE).first();
  if (await old.isVisible().catch(() => false)) {
    return true;
  }
  const anyStrike = page.locator("s, del, [class*='strikethrough']");
  return anyStrike
    .first()
    .isVisible()
    .catch(() => false);
}

async function hasSaleLabelNearPrice(page: Page): Promise<boolean> {
  const region = page
    .locator(".product-detail-top-info, [class*='product-detail'], main")
    .first();
  const copy = (await region.innerText().catch(() => '')) ?? '';
  return /\b(sale|off|%|discoun|reduc|promo)\b/i.test(copy);
}

async function checkSale(page: Page): Promise<CheckResult> {
  const onSaleByOld = await hasStrikethroughOrOldPrice(page);
  const onSaleByLabel = await hasSaleLabelNearPrice(page);
  const priceText = await readCurrentPriceText(page);
  const matched = onSaleByOld || onSaleByLabel;
  return {
    matched,
    reason: matched ? 'uniqlo_sale_detected' : 'uniqlo_no_sale_indicators',
    details: {
      currentPrice: priceText,
      hasOldOrStruckPrice: onSaleByOld,
      hasSaleLikeLabel: onSaleByLabel,
    },
  };
}

/**
 * OOS and “notify me” copy on the PDP. Keep patterns literal so we do not false-positive on
 * unrelated “add to wishlist” or header text.
 */
async function hasPdpOutOfStockSignals(page: Page): Promise<boolean> {
  const t =
    (
      await page
        .locator('main')
        .innerText()
        .catch(() => '')
    )?.toLowerCase() ?? '';
  if (t.length === 0) {
    return false;
  }
  if (t.includes('out of stock') || t.includes('sold out')) {
    return true;
  }
  if (t.includes('notify me when') && /\b(back|available|stock)\b/.test(t)) {
    return true;
  }
  if (/e-?mail (me )?when( it'?s| its)? (in stock|available|back)/.test(t)) {
    return true;
  }
  return (
    /not available( for| online)?( purchase| for purchase)?/i.test(t) ||
    /\bunavailable\b/.test(t)
  );
}

/** Prefer add-to-bag, never “add to wishlist” (both contain “add”, so never use a bare /add/ pick). */
const BUY_CTA =
  /add to (bag|basket|cart)\b|añadir a la (cesta|bolsa|canasta|carrito)|tambah ke (beg|keranjang|bakul)\b|agregar (al|a la) (carro|carrito|cesta|bolsa|canasta)\b|加入(至)?(购|購)物(袋|车|車)/i;

function pdpAddToCartButton(page: Page): Locator {
  const main = page.locator('main');
  const byDataQa = main.locator(
    'button[data-qa-action*="addToCart"], button[data-qa-action*="add-to-cart"]',
  );
  return byDataQa
    .or(main.getByRole('button', { name: BUY_CTA }))
    .or(main.getByLabel(BUY_CTA))
    .first();
}

/** True if the real purchase CTA is inert, disabled, or ARIA-marked out of use. */
async function isCtaTreatedAsDisabled(cta: Locator): Promise<boolean> {
  const ar = (await cta.getAttribute('aria-disabled'))?.toLowerCase();
  if (ar === 'true' || ar === '1') {
    return true;
  }
  if (
    (await cta.getAttribute('data-qa-availability'))?.toLowerCase() ===
    'out-of-stock'
  ) {
    return true;
  }
  return cta
    .evaluate(
      (el) =>
        (el as HTMLButtonElement | HTMLInputElement).disabled ||
        el.getAttribute('aria-disabled') === 'true',
    )
    .catch(() => false);
}

/** In stock: PDP does not read as OOS, the buy CTA is visible, and the buy CTA is not disabled. */
async function checkRestock(page: Page): Promise<CheckResult> {
  // Let the bundle finish updating sizes / CTA (domcontentloaded alone can leave a stale “enabled” wishlist or header).
  await page
    .waitForLoadState('load', { timeout: 20_000 })
    .catch(() => undefined);
  const currentPrice = await readCurrentPriceText(page);
  if (await hasPdpOutOfStockSignals(page)) {
    return {
      matched: false,
      reason: 'uniqlo_pdp_out_of_stock_messaging',
      details: { currentPrice },
    };
  }
  const cta = pdpAddToCartButton(page);
  if (!(await cta.isVisible().catch(() => false))) {
    return {
      matched: false,
      reason: 'uniqlo_pdp_add_to_bag_not_found',
      details: {
        currentPrice,
        hint: 'Re-check selectors: Zara may have changed the buy button or is blocking automation.',
      },
    };
  }
  if (await isCtaTreatedAsDisabled(cta)) {
    return {
      matched: false,
      reason: 'uniqlo_add_to_bag_disabled_or_inert',
      details: { currentPrice },
    };
  }
  if (!(await cta.isEnabled().catch(() => false))) {
    return {
      matched: false,
      reason: 'uniqlo_add_to_bag_not_enabled',
      details: { currentPrice },
    };
  }
  return {
    matched: true,
    reason: 'uniqlo_in_stock_purchase_cta',
    details: { addToBagEnabled: true, currentPrice },
  };
}

const uniqloMyAdapter: SiteAdapter = {
  id: 'uniqlo-my',
  displayName: 'Uniqlo Malaysia',

  supports(url: URL): boolean {
    return (
      url.hostname === UNIQLO_HOST && url.pathname.includes(UNIQLO_MY_PATH)
    );
  },

  async check(
    page: Page,
    mode: TrackMode,
    ctx: TrackContext,
  ): Promise<CheckResult> {
    try {
      if (mode === 'sale') {
        return checkSale(page);
      }
      return checkRestock(page);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        matched: false,
        reason: 'uniqlo_check_error',
        details: { error: message },
      };
    }
  },
};

export default uniqloMyAdapter;
