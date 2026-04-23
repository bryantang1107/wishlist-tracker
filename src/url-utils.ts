import type { TrackMode } from "./types.js";

export type UrlConfigEntry = {
  url: string;
  mode: TrackMode;
};

function isTrackMode(x: unknown): x is TrackMode {
  return x === "sale" || x === "restock";
}

export function normalizeShellEscapesInUrl(href: string): string {
  return href.trim().replace(/\\([?&=#])/g, "$1");
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
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, message: "URL must use http or https" };
  }
  return { ok: true, href: u.href };
}

interface UrlsFileShape {
  urls: unknown;
}

function isUrlsFileShape(x: unknown): x is UrlsFileShape {
  return typeof x === "object" && x !== null && "urls" in x;
}

function isUrlConfigEntryObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * Parse and validate the JSON config: `{ "urls": [ { "url": "https://…", "mode": "sale" | "restock" } ] }`.
 */
export function parseUrlsConfigJson(
  data: unknown,
):
  | { ok: true; entries: UrlConfigEntry[] }
  | { ok: false; message: string } {
  if (!isUrlsFileShape(data)) {
    return {
      ok: false,
      message: "Config must be a JSON object with a \"urls\" array.",
    };
  }
  const { urls } = data;
  if (!Array.isArray(urls) || urls.length === 0) {
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
    if (typeof url !== "string" || url.trim() === "") {
      return { ok: false, message: `urls[${i}].url must be a non-empty string.` };
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
