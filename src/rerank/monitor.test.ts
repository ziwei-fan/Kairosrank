import { describe, it, expect, beforeEach } from 'vitest';
import { Monitor } from './monitor';

// chrome.storage.session + local mock (monitor reads local via getSiteMemory).
const session: Record<string, unknown> = {};
const local: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of Object.keys(session)) delete session[k];
  for (const k of Object.keys(local)) delete local[k];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: 'test' },
    storage: {
      session: {
        get: async (k: string) => ({ [k]: session[k] }),
        set: async (o: Record<string, unknown>) => void Object.assign(session, o),
      },
      local: {
        get: async (k: string) => ({ [k]: local[k] }),
        set: async (o: Record<string, unknown>) => void Object.assign(local, o),
      },
    },
  };
});

const T0 = 1_000_000;

describe('Monitor frustration + gating', () => {
  it('stays quiet when signals are calm', async () => {
    const m = new Monitor('iyf', T0);
    await m.load(T0);
    m.noteScroll(500);
    m.noteHover();
    expect(m.assess(T0).suggest).toBe(false);
  });

  it('suggests once wandering signals accumulate', async () => {
    const m = new Monitor('iyf', T0);
    await m.load(T0);
    for (let i = 0; i < 25; i++) m.noteHover(); // lots of looking
    m.noteScroll(12000); // lots of scrolling
    // no opens + long dwell
    const a = m.assess(T0 + 50000);
    expect(a.score).toBeGreaterThanOrEqual(0.6);
    expect(a.suggest).toBe(true);
  });

  it('counts a bounce when the last opened video was closed fast', async () => {
    // seed persistent memory: video watched only 5s
    local['memory:iyf'] = { clicks: [{ id: '/play/x', title: 'X', ts: T0, watchMs: 5000 }], answers: [] };
    const m = new Monitor('iyf', T0);
    await m.load(T0);
    await m.noteOpen('/play/x');
    await m.reconcileReturn(T0 + 1000);
    // one bounce alone isn't enough, but two + some scroll should trip it
    await m.noteOpen('/play/x');
    await m.reconcileReturn(T0 + 2000);
    m.noteScroll(6000);
    expect(m.assess(T0 + 3000).score).toBeGreaterThanOrEqual(0.6);
  });

  it('respects the offer budget and cooldown', async () => {
    const m = new Monitor('iyf', T0);
    await m.load(T0);
    for (let i = 0; i < 25; i++) m.noteHover();
    m.noteScroll(12000);
    expect(m.assess(T0 + 50000).suggest).toBe(true);
    await m.markOffered(T0 + 50000);
    expect(m.assess(T0 + 50000).reason).toBe('cooldown'); // just offered
    await m.markOffered(T0 + 300000);
    expect(m.assess(T0 + 300000).reason).toBe('offer budget spent'); // 2 offers used
  });

  it('decide() gates on page context: frustrated but only interrupts on a ready listing', async () => {
    const m = new Monitor('iyf', T0);
    await m.load(T0);
    for (let i = 0; i < 25; i++) m.noteHover();
    m.noteScroll(12000);
    const now = T0 + 50000;
    // frustrated, but context blocks it
    expect(m.decide(now, { onListing: false, cardsReady: true, interacting: false }).suggest).toBe(false);
    expect(m.decide(now, { onListing: true, cardsReady: false, interacting: false }).suggest).toBe(false);
    expect(m.decide(now, { onListing: true, cardsReady: true, interacting: true }).suggest).toBe(false);
    // right context + frustrated → interrupt
    expect(m.decide(now, { onListing: true, cardsReady: true, interacting: false }).suggest).toBe(true);
  });

  it('suppresses after the user declines', async () => {
    const m = new Monitor('iyf', T0);
    await m.load(T0);
    for (let i = 0; i < 25; i++) m.noteHover();
    m.noteScroll(12000);
    await m.suppress(T0 + 50000);
    expect(m.assess(T0 + 60000).suggest).toBe(false);
  });
});
