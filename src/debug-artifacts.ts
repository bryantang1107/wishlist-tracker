import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { TrackContext } from './types.js';

function nowStamp(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

export async function writeDebugArtifacts(options: {
  page: Page;
  ctx: TrackContext;
}): Promise<{ dir: string; screenshotPath: string } | undefined> {
  const { page, ctx } = options;

  // Only capture for headless by default; headed runs are debuggable interactively.
  if (ctx.headed) {
    return undefined;
  }

  const dir = path.join(process.cwd(), 'artifacts');
  await mkdir(dir, { recursive: true });

  const screenshotPath = path.join(dir, `${nowStamp()}.png`);

  await page
    .screenshot({ path: screenshotPath, fullPage: true })
    .catch(() => undefined);

  return { dir, screenshotPath };
}
