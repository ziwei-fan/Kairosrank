// Turn the always-on journey state into a fixed, normalized feature vector for the
// tiny "when-to-interact" classifier. Pure + cheap — computed on every decision tick.

export interface JourneySnapshot {
  scrollPx: number; // total scroll distance this session
  hovers: number; // card hovers
  opens: number; // items opened
  bounces: number; // opened-and-left-fast
  hunts: number; // searches / filter changes
  dwellMs: number; // time on the current listing
  sinceLastOpenMs: number; // time since the last item open (large if never / long ago)
  lastWatchRatio: number; // 0..1, how much of the last opened item was consumed (satisfaction proxy)
  hour: number; // local hour 0..23
  // Research/discovery signals (optional — default 0/false for the video sites).
  abstractSkims?: number; // opened an item then left fast without a deep-open → skimming, unsatisfied
  deepOpens?: number; // opened a PDF/code/download/"use this" → strong engagement
  queryRefines?: number; // successive search/sort commits with no open → actively hunting
  staleFraction?: number; // 0..1 fraction of the current listing already seen before
  savedThisSession?: boolean; // liked/upvoted/starred/bibtex this session → satisfied
  revisit?: boolean; // returned to a listing seen earlier
}

export const FEATURE_NAMES = [
  'scroll',
  'hovers',
  'opens',
  'bounces',
  'hunts',
  'dwell',
  'sinceLastOpen',
  'noOpenYet',
  'lastDissatisfaction',
  'lateNight',
  // research/discovery signals
  'abstractSkims',
  'deepOpens',
  'queryRefines',
  'staleFraction',
  'savedThisSession',
  'revisit',
] as const;

export const N_FEATURES = FEATURE_NAMES.length;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function extractFeatures(s: JourneySnapshot): number[] {
  return [
    clamp01(s.scrollPx / 10000),
    clamp01(s.hovers / 20),
    clamp01(s.opens / 5),
    clamp01(s.bounces / 3),
    clamp01(s.hunts / 5),
    clamp01(s.dwellMs / 120000),
    clamp01(s.sinceLastOpenMs / 120000),
    s.opens === 0 ? 1 : 0,
    clamp01(1 - s.lastWatchRatio), // short last watch → dissatisfaction
    s.hour >= 22 || s.hour < 5 ? 1 : 0,
    clamp01((s.abstractSkims ?? 0) / 4),
    clamp01((s.deepOpens ?? 0) / 3),
    clamp01((s.queryRefines ?? 0) / 4),
    clamp01(s.staleFraction ?? 0),
    s.savedThisSession ? 1 : 0,
    s.revisit ? 1 : 0,
  ];
}
