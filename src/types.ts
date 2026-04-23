import type { Page } from 'playwright';

export type TrackMode = 'sale' | 'restock';

export type TrackContext = {
  productUrl: string;
  mode: TrackMode;
  headed: boolean;
};

export type CheckResult = {
  matched: boolean;
  reason: string;
  details?: Record<string, string | boolean | number | undefined>;
};

export interface SiteAdapter {
  readonly id: string;
  supports(url: URL): boolean;
  check(page: Page, mode: TrackMode, ctx: TrackContext): Promise<CheckResult>;
}
