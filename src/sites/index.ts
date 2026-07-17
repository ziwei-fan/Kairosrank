import type { SiteConfig } from './types';
import { iyf } from './iyf';
import { arxiv } from './arxiv';
import { huggingface } from './huggingface';
import { hackernews } from './hackernews';
import { paperswithcode } from './paperswithcode';

export const SITES: SiteConfig[] = [iyf, arxiv, huggingface, hackernews, paperswithcode];

export function pickSite(host: string): SiteConfig | null {
  return SITES.find((s) => s.matches(host)) ?? null;
}

export type { SiteConfig, Card } from './types';
export { collectCards, probe, siblingRun } from './types';
