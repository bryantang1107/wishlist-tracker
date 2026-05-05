import type { BrowserContext } from 'playwright';
import { onMatch } from './actions/on-match.js';
import { launchBrowser } from './browser.js';
import { writeDebugArtifacts } from './debug-artifacts.js';
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
      const result = await runSingleCheck(page, ctx);
      if (!result.matched) {
        const artifacts = await writeDebugArtifacts({ page, ctx });
        if (artifacts) {
          console.log(
            `[debug] saved headless artifacts: ${artifacts.screenshotPath}`,
          );
        }
      }
      return result;
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

import { readFile } from 'node:fs/promises';
import { parseHttpProductUrl, parseUrlsFileContent } from './url-utils.js';
import { getUrlsConfigPath } from './url-utils.js';

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export async function loadAndRunEntries(options: {
  headed: boolean;
  continueOnError: boolean;
}): Promise<void> {
  const configPath = getUrlsConfigPath();
  let fileText: string;
  try {
    fileText = await readFile(configPath, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Could not read config at ${configPath}: ${message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(fileText) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Invalid JSON in ${configPath}: ${message}`);
  }
  const list = parseUrlsFileContent(json);
  if (!list.ok) {
    throw new ConfigError(list.message);
  }
  if (list.entries.length === 0) {
    throw new ConfigError(
      `No URLs in ${getUrlsConfigPath()}. Add entries or use POST /tracks.`,
    );
  }

  for (const { url: hrefRaw, mode } of list.entries) {
    const parsed = parseHttpProductUrl(hrefRaw);
    if (!parsed.ok) {
      throw new ConfigError(
        `URL invalid in config: ${hrefRaw}\n${parsed.message}`,
      );
    }
    if (getAdapterForUrlString(parsed.href) === undefined) {
      throw new ConfigError(
        `Unsupported URL in config (no site adapter): ${parsed.href}`,
      );
    }

    const ctx: TrackContext = {
      productUrl: parsed.href,
      mode,
      headed: options.headed,
    };

    try {
      console.log(`[tracker] ${ctx.productUrl}: ${ctx.mode}`);
      await runTracker(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[tracker] ${ctx.productUrl}: ${message}`);
      if (!options.continueOnError) {
        throw err;
      }
    }
  }
}

export async function runAllTrackersFromConfig(options: {
  headed: boolean;
  continueOnError: boolean;
}): Promise<void> {
  await loadAndRunEntries(options);
}
