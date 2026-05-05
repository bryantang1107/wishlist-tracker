import type { TrackMode, UrlConfigEntry } from './types.js';

export function isTrackMode(x: unknown): x is TrackMode {
  return x === 'sale' || x === 'restock';
}

export function normalizeShellEscapesInUrl(href: string): string {
  return href.trim().replace(/\\([?&=#])/g, '$1');
}

export function parseHttpProductUrl(
  href: string,
): { ok: true; href: string } | { ok: false; message: string } {
  const normalized = normalizeShellEscapesInUrl(href);
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    return {
      ok: false,
      message:
        "Invalid URL. Paste the full product link. In zsh/bash use single quotes so ? and & are not interpreted: 'https://www.zara.com/.../p....html?v1=123'",
    };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, message: 'URL must use http or https' };
  }
  return { ok: true, href: u.href };
}

interface UrlsFileShape {
  urls: unknown;
}

function isUrlsFileShape(x: unknown): x is UrlsFileShape {
  return typeof x === 'object' && x !== null && 'urls' in x;
}

/**
 * Parse on-disk `config/urls.json`: `urls` may be absent (treated as `[]`); `urls: []` is valid.
 * Use for API + writing; the runner still enforces at least one URL before checks.
 */
export function parseUrlsFileContent(
  data: unknown,
): { ok: true; entries: UrlConfigEntry[] } | { ok: false; message: string } {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: 'Config must be a JSON object.' };
  }
  const o = data as Record<string, unknown>;
  if (!('urls' in o)) {
    return parseUrlsConfigJson({ urls: [] }, { allowEmptyUrls: true });
  }
  return parseUrlsConfigJson(
    { urls: o['urls'] as unknown },
    { allowEmptyUrls: true },
  );
}

function isUrlConfigEntryObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Parse and validate the JSON config: `{ "urls": [ { "url": "https://…", "mode": "sale" | "restock" } ] }`.
 * Use `allowEmptyUrls` when loading from disk (API may append) — the run script still needs ≥1 entry to do work.
 */
export function parseUrlsConfigJson(
  data: unknown,
  options?: { allowEmptyUrls?: boolean },
): { ok: true; entries: UrlConfigEntry[] } | { ok: false; message: string } {
  if (!isUrlsFileShape(data)) {
    return {
      ok: false,
      message: 'Config must be a JSON object with a "urls" array.',
    };
  }
  const { urls } = data;
  if (!Array.isArray(urls)) {
    return {
      ok: false,
      message: '"urls" must be an array of { "url", "mode" } objects.',
    };
  }
  if (urls.length === 0) {
    if (options?.allowEmptyUrls) {
      return { ok: true, entries: [] };
    }
    return {
      ok: false,
      message: '"urls" must be a non-empty array of { "url", "mode" } objects.',
    };
  }
  const entries: UrlConfigEntry[] = [];
  for (let i = 0; i < urls.length; i += 1) {
    const item = urls[i];
    if (!isUrlConfigEntryObject(item)) {
      return {
        ok: false,
        message: `urls[${i}] must be an object with "url" and "mode".`,
      };
    }
    const { url, mode } = item;
    if (typeof url !== 'string' || url.trim() === '') {
      return {
        ok: false,
        message: `urls[${i}].url must be a non-empty string.`,
      };
    }
    if (!isTrackMode(mode)) {
      return {
        ok: false,
        message: `urls[${i}].mode must be "sale" or "restock".`,
      };
    }
    entries.push({ url, mode });
  }
  return { ok: true, entries };
}

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const URLS_CONFIG_RELATIVE = 'config/urls.json';

export function getUrlsConfigPath(): string {
  return path.resolve(process.cwd(), URLS_CONFIG_RELATIVE);
}

export async function readUrlsFileEntries(): Promise<UrlConfigEntry[]> {
  const p = getUrlsConfigPath();
  const text = await readFile(p, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Invalid JSON in ${p}`);
  }
  const list = parseUrlsFileContent(data);
  if (!list.ok) {
    throw new Error(list.message);
  }
  return list.entries;
}

export async function writeUrlsFileEntries(
  entries: UrlConfigEntry[],
): Promise<void> {
  const p = getUrlsConfigPath();
  const dir = path.dirname(p);
  await mkdir(dir, { recursive: true });
  const body = `${JSON.stringify({ urls: entries }, null, 2)}\n`;
  const tmp = `${p}.${process.pid}.tmp`;
  await writeFile(tmp, body, 'utf8');
  await rename(tmp, p);
}
