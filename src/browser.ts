import { chromium } from 'playwright';
import type { TrackContext } from './types.js';

const DEFAULT_VIEWPORT = { width: 1280, height: 900 };
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_NAV_TIMEOUT_MS = 45_000;

/**
 * v1: stock Playwright Chromium. If you hit anti-bot or flaky loads, try headed mode, slower navigation,
 * or a follow-up: playwright-extra + stealth, proxies, or residential IP — plug in at launch here.
 */
export async function launchBrowser(ctx: TrackContext) {
  const browser = await chromium.launch({
    headless: !ctx.headed,
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-MY',
    extraHTTPHeaders: {
      'accept-language': 'en-US,en;q=0.9',
    },
    timezoneId: 'Asia/Kuala_Lumpur',
    viewport: DEFAULT_VIEWPORT,
    ignoreHTTPSErrors: true,
  });

  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT_MS);

  return { browser, context };
}
