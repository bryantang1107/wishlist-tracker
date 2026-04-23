import type { BrowserContext } from 'playwright';
import { onMatch } from './actions/on-match.js';
import { launchBrowser } from './browser.js';
import type { CheckResult, TrackContext } from './types.js';
import { getAdapterForUrlString } from './sites/registry.js';

/**
 * One full check: navigate, run site adapter, return result. Caller owns page lifecycle.
 */
export async function runSingleCheck(
  page: Awaited<ReturnType<BrowserContext['newPage']>>,
  ctx: TrackContext,
): Promise<CheckResult> {
  const url = new URL(ctx.productUrl);
  const adapter = getAdapterForUrlString(ctx.productUrl);
  if (adapter === undefined) {
    return {
      matched: false,
      reason: 'no_site_adapter',
      details: { hostname: url.hostname, pathname: url.pathname },
    };
  }

  await page.goto(ctx.productUrl, {
    waitUntil: 'domcontentloaded',
  });

  return adapter.check(page, ctx.mode, ctx);
}

/**
 * Run once or on an interval. Reuses one browser and context; opens a new page per check.
 */
export async function runTracker(ctx: TrackContext): Promise<void> {
  const { browser, context } = await launchBrowser(ctx);

  const run = async (): Promise<CheckResult> => {
    const page = await context.newPage();
    try {
      return await runSingleCheck(page, ctx);
    } finally {
      await page.close();
    }
  };

  const result = await run();
  const line = result.matched
    ? `MATCH: ${result.reason} ${result.details ? JSON.stringify(result.details) : ''}`.trim()
    : `no match: ${result.reason}`;
  console.log(line);
  if (result.matched) {
    await onMatch(result);
  }
  await context.close();
  await browser.close();
}
