import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getAdapterForUrlString } from './sites/registry.js';
import { runTracker } from './tracker.js';
import type { TrackContext, TrackMode } from './types.js';
import { parseHttpProductUrl, parseUrlsConfigJson } from './url-utils.js';
import config from '../config/urls.json' with { type: 'json' };

const DEFAULT_HEADED = true;

async function main(): Promise<void> {
  const list = parseUrlsConfigJson(config);
  if (!list.ok) {
    console.error(list.message);
    process.exit(1);
  }

  const resolved: { href: string; mode: TrackMode }[] = [];
  for (const { url: hrefRaw, mode } of list.entries) {
    const parsed = parseHttpProductUrl(hrefRaw);
    if (!parsed.ok) {
      console.error(`URL invalid in config: ${hrefRaw}\n${parsed.message}`);
      process.exit(1);
    }
    if (getAdapterForUrlString(parsed.href) === undefined) {
      console.error(
        `Unsupported URL in config (no site adapter): ${parsed.href}`,
      );
      process.exit(1);
    }
    resolved.push({ href: parsed.href, mode });
  }

  for (const { href, mode } of resolved) {
    const ctx: TrackContext = {
      productUrl: href,
      mode,
      headed: DEFAULT_HEADED,
    };

    try {
      await runTracker(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(2);
    }
  }
  process.exit(0);
}

void main();
