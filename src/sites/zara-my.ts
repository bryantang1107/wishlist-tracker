import type { Locator, Page } from 'playwright';
import type { CheckResult, TrackMode } from '../types.js';
import type { SiteAdapter } from '../types.js';
import { OOS_KEYWORDS, OOS_REGEX, BUY_CTA } from '../constant.js';

const ZARA_HOST = 'www.zara.com';
const ZARA_MY_PATH = '/my/';

const PRICE_MAIN = '.price-current__amount, .price__amount--on-sale';
const OLD_PRICE = '.price-old__amount ';
const DISCOUNT_PERCENTAGE = '.price-current__discount-percentage';

function parseString(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function readCurrentPriceText(page: Page): Promise<string | undefined> {
  const main = page.locator(PRICE_MAIN).first();
  if (await main.isVisible().catch(() => false)) {
    return parseString((await main.innerText()) ?? '');
  }
  return undefined;
}

async function readDiscountPercentageText(
  page: Page,
): Promise<string | undefined> {
  const main = page.locator(DISCOUNT_PERCENTAGE).first();
  if (await main.isVisible().catch(() => false)) {
    return parseString((await main.innerText()) ?? '');
  }
  return undefined;
}

async function hasStrikethroughOrOldPrice(page: Page): Promise<{
  hasOldPrice: boolean;
  oldPrice: string;
  discountPercentage?: string;
}> {
  let obj = { hasOldPrice: false, oldPrice: '', discountPercentage: '-' };
  //check if old price is visible
  const discountPercentage = await readDiscountPercentageText(page);
  if (discountPercentage) {
    obj.discountPercentage = discountPercentage;
  }
  const old = page.locator(OLD_PRICE).first();
  if (await old.isVisible().catch(() => false)) {
    obj.hasOldPrice = true;
    obj.oldPrice = parseString((await old.innerText()) ?? '');
    return obj;
  }

  //check if any strike is visible
  const anyStrike = page.locator("s, del, [class*='strikethrough']").first();
  if (await anyStrike.isVisible().catch(() => false)) {
    obj.hasOldPrice = true;
    obj.oldPrice = parseString((await anyStrike.innerText()) ?? '');
    return obj;
  }
  return obj;
}

async function checkSale(page: Page): Promise<CheckResult> {
  const { hasOldPrice, oldPrice, discountPercentage } =
    await hasStrikethroughOrOldPrice(page);
  const priceText = await readCurrentPriceText(page);
  const matched = hasOldPrice;
  return {
    matched,
    reason: matched ? 'zara_sale_detected' : 'zara_no_sale_indicators',
    details: {
      oldPrice: oldPrice,
      currentPrice: priceText,
      hasOldOrStruckPrice: hasOldPrice,
      discountPercentage: discountPercentage,
    },
  };
}

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
  const matchedKeyword = OOS_KEYWORDS.find((keyword) => t.includes(keyword));
  if (matchedKeyword) {
    console.log('OOS keyword matched:', matchedKeyword);
    return true;
  }

  const matchedRegex = OOS_REGEX.find((regex) => regex.test(t));
  if (matchedRegex) {
    console.log('OOS regex matched:', matchedRegex.toString());
    return true;
  }
  return false;
}

function pdpAddToCartButton(page: Page): Locator {
  const main = page.locator('main');
  return main
    .getByRole('button', { name: BUY_CTA })
    .or(main.getByLabel(BUY_CTA))
    .first();
}

/** True if the real purchase CTA is inert, disabled, or ARIA-marked out of use. */
async function isCtaTreatedAsDisabled(cta: Locator): Promise<boolean> {
  const ar = (await cta.getAttribute('aria-disabled'))?.toLowerCase();
  if (ar === 'true' || ar === '1') {
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
  await page
    .waitForLoadState('load', { timeout: 20_000 })
    .catch(() => undefined);
  const currentPrice = await readCurrentPriceText(page);
  if (await hasPdpOutOfStockSignals(page)) {
    return {
      matched: false,
      reason: 'zara_pdp_out_of_stock_messaging',
      details: { currentPrice },
    };
  }
  const cta = pdpAddToCartButton(page);
  if (!(await cta.isVisible().catch(() => false))) {
    return {
      matched: false,
      reason: 'zara_pdp_add_to_bag_not_found',
      details: {
        currentPrice,
        hint: 'Re-check selectors: Zara may have changed the buy button or is blocking automation.',
      },
    };
  }
  if (await isCtaTreatedAsDisabled(cta)) {
    return {
      matched: false,
      reason: 'zara_add_to_bag_disabled_or_inert',
      details: { currentPrice },
    };
  }
  if (!(await cta.isEnabled().catch(() => false))) {
    return {
      matched: false,
      reason: 'zara_add_to_bag_not_enabled',
      details: { currentPrice },
    };
  }
  return {
    matched: true,
    reason: 'zara_in_stock_purchase_cta',
    details: { addToBagEnabled: true, currentPrice },
  };
}

const zaraMyAdapter: SiteAdapter = {
  id: 'zara-my',

  supports(url: URL): boolean {
    return url.hostname === ZARA_HOST && url.pathname.includes(ZARA_MY_PATH);
  },

  async check(page: Page, mode: TrackMode): Promise<CheckResult> {
    try {
      if (mode === 'sale') {
        return checkSale(page);
      }
      return checkRestock(page);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        matched: false,
        reason: 'zara_check_error',
        details: { error: message },
      };
    }
  },
};

export default zaraMyAdapter;
