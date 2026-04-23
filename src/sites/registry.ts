import type { SiteAdapter } from '../types.js';
import zaraMyAdapter from './zara-my.js';

const adapters: readonly SiteAdapter[] = [zaraMyAdapter];

export function getAdapterForUrlString(href: string): SiteAdapter | undefined {
  try {
    const url = new URL(href);
    return adapters.find((a) => a.supports(url));
  } catch {
    return undefined;
  }
}
