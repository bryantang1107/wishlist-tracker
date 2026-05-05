import type { SiteAdapter } from '../types.js';
import zaraMyAdapter from './zara-my.js';
import uniqloMyAdapter from './uniqlo-my.js';

const adapters: readonly SiteAdapter[] = [zaraMyAdapter, uniqloMyAdapter];

export function getSupportedSites(): ReadonlyArray<{
  id: string;
  displayName: string;
}> {
  return adapters.map((a) => ({ id: a.id, displayName: a.displayName }));
}

export function getAdapterForUrlString(href: string): SiteAdapter | undefined {
  try {
    const url = new URL(href);
    return adapters.find((a) => a.supports(url));
  } catch {
    return undefined;
  }
}
