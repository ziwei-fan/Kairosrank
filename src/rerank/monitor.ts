// Parallel behavioral monitor — the "when to interrupt" problem, kept SEPARATE
// from the ranking logic. Accumulates a frustration/uncertainty score from
// negative signals and decides (gated) whether to proactively offer a re-rank.
//
// This is a heuristic first cut, not solved science. Every weight/threshold here
// is a knob. State is per-site and ephemeral (chrome.storage.session), so it
// tracks the CURRENT browsing session and survives in-session navigation.

import { getSiteMemory } from './memory';
import { extAlive } from './ext';
import { log } from '../logger';
import type { JourneySnapshot } from './features';

const KEY = (s: string) => `wander:${s}`;

// Tunable knobs.
const BOUNCE_MS = 60000; // opened but returned within a minute = a bounce (didn't like it)
const COMMIT_MS = 120000; // watched 2+ min = found something (resets frustration)
const MAX_SUGGEST = 2; // per session, budget on proactive offers
const COOLDOWN_MS = 90000; // min gap between offers
const SUPPRESS_MS = 10 * 60000; // after a "no", back off this long
const THRESHOLD = 0.6; // frustration score that triggers an offer
const IDLE_SCAN_MS = 45000; // long time on a listing with no open

export interface WanderState {
  scrollPx: number;
  hovers: number;
  opens: number;
  bounces: number;
  hunts: number; // search/filter changes without committing to a video
  lastOpenId: string | null;
  lastOpenTs: number;
  firstSeenTs: number;
  suggestions: number;
  cooldownUntil: number;
  suppressedUntil: number;
}

function fresh(now: number): WanderState {
  return {
    scrollPx: 0,
    hovers: 0,
    opens: 0,
    bounces: 0,
    hunts: 0,
    lastOpenId: null,
    lastOpenTs: 0,
    firstSeenTs: now,
    suggestions: 0,
    cooldownUntil: 0,
    suppressedUntil: 0,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export interface Assessment {
  suggest: boolean;
  score: number;
  reason: string;
}

// The page context at the moment of a potential interruption. The Monitor — not
// the flow — decides whether a given context warrants interrupting the user.
export interface DecisionContext {
  onListing: boolean; // current page is a listing (not a single video)
  cardsReady: boolean; // enough cards detected to re-rank
  interacting: boolean; // a round/offer is already on screen
}

export class Monitor {
  private state: WanderState;

  constructor(private siteId: string, now: number) {
    this.state = fresh(now);
  }

  async load(now: number): Promise<void> {
    if (!extAlive()) return;
    const got = await chrome.storage.session.get(KEY(this.siteId));
    const saved = got[KEY(this.siteId)] as WanderState | undefined;
    this.state = saved ? { ...fresh(now), ...saved } : fresh(now);
  }

  private async save(): Promise<void> {
    if (!extAlive()) return;
    await chrome.storage.session.set({ [KEY(this.siteId)]: this.state });
  }

  noteScroll(px: number): void {
    this.state.scrollPx += Math.abs(px);
  }

  noteHover(): void {
    this.state.hovers++;
  }

  // The user searched or changed filters/sort — actively hunting for something.
  noteHunt(): void {
    this.state.hunts++;
  }

  async noteOpen(id: string): Promise<void> {
    this.state.opens++;
    this.state.lastOpenId = id;
    this.state.lastOpenTs = Date.now();
    await this.save();
  }

  // Rate-limit gate only (budget / cooldown / suppression) — the "should we act"
  // decision now lives in the online policy, fed by journeySnapshot().
  gate(now: number): { ok: boolean; reason: string } {
    if (now < this.state.suppressedUntil) return { ok: false, reason: 'suppressed' };
    if (this.state.suggestions >= MAX_SUGGEST) return { ok: false, reason: 'budget' };
    if (now < this.state.cooldownUntil) return { ok: false, reason: 'cooldown' };
    return { ok: true, reason: 'ok' };
  }

  journeySnapshot(now: number, lastWatchRatio: number): JourneySnapshot {
    return {
      scrollPx: this.state.scrollPx,
      hovers: this.state.hovers,
      opens: this.state.opens,
      bounces: this.state.bounces,
      hunts: this.state.hunts,
      dwellMs: now - this.state.firstSeenTs,
      sinceLastOpenMs: this.state.lastOpenTs ? now - this.state.lastOpenTs : 999999,
      lastWatchRatio,
      hour: new Date(now).getHours(),
    };
  }

  // Call on landing on a listing page: classify how the last opened video went.
  async reconcileReturn(now: number): Promise<void> {
    if (!this.state.lastOpenId) return;
    const mem = await getSiteMemory(this.siteId);
    const watched = mem.clicks.find((c) => c.id === this.state.lastOpenId)?.watchMs ?? 0;
    if (watched < BOUNCE_MS) {
      this.state.bounces++;
      log(`monitor: bounce — closed after ${Math.round(watched / 1000)}s (bounces=${this.state.bounces})`, '#f59e0b');
    } else if (watched > COMMIT_MS) {
      // Found something they liked → this scanning episode is over.
      this.state.scrollPx = 0;
      this.state.hovers = 0;
      this.state.bounces = 0;
      this.state.hunts = 0;
      this.state.suppressedUntil = 0;
      log(`monitor: commit — watched ${Math.round(watched / 1000)}s, reset frustration`, '#10b981');
    }
    this.state.lastOpenId = null;
    await this.save();
  }

  score(now: number): number {
    const dwell = now - this.state.firstSeenTs;
    return clamp01(
      this.state.bounces * 0.35 +
        Math.min(this.state.scrollPx / 10000, 1) * 0.25 +
        Math.min(this.state.hovers / 20, 1) * 0.2 +
        Math.min(this.state.hunts / 5, 1) * 0.25 + // lots of searching/filtering, no commit
        (this.state.opens === 0 && dwell > IDLE_SCAN_MS ? 0.3 : 0),
    );
  }

  // Frustration + budget/cooldown/suppression gating (page-context-agnostic).
  assess(now: number): Assessment {
    const score = this.score(now);
    if (now < this.state.suppressedUntil) return { suggest: false, score, reason: 'suppressed (user said no)' };
    if (this.state.suggestions >= MAX_SUGGEST) return { suggest: false, score, reason: 'offer budget spent' };
    if (now < this.state.cooldownUntil) return { suggest: false, score, reason: 'cooldown' };
    return { suggest: score >= THRESHOLD, score, reason: score >= THRESHOLD ? 'frustrated' : 'below threshold' };
  }

  // THE single interruption authority: layers page-context over the frustration
  // assessment. Every evaluation point (scroll pause, idle tick, navigation to a
  // listing) routes through here, so context changes only ever interrupt via the
  // Monitor's own policy.
  decide(now: number, ctx: DecisionContext): Assessment {
    const base = this.assess(now);
    if (!ctx.onListing) return { suggest: false, score: base.score, reason: 'on a video (engaged) — no interrupt' };
    if (!ctx.cardsReady) return { suggest: false, score: base.score, reason: 'no cards yet' };
    if (ctx.interacting) return { suggest: false, score: base.score, reason: 'already interacting' };
    return base;
  }

  async markOffered(now: number): Promise<void> {
    this.state.suggestions++;
    this.state.cooldownUntil = now + COOLDOWN_MS;
    await this.save();
  }

  async markAccepted(): Promise<void> {
    // They took the help; clear the scanning signals so we don't immediately re-offer.
    this.state.scrollPx = 0;
    this.state.hovers = 0;
    this.state.bounces = 0;
    await this.save();
  }

  async suppress(now: number): Promise<void> {
    this.state.suppressedUntil = now + SUPPRESS_MS;
    await this.save();
  }
}
