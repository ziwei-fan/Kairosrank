import { describe, it, expect } from 'vitest';
import { initialWeights, predict, learn } from './policy';
import { extractFeatures, N_FEATURES, type JourneySnapshot } from './features';

const calm: JourneySnapshot = {
  scrollPx: 300, hovers: 1, opens: 1, bounces: 0, hunts: 0,
  dwellMs: 5000, sinceLastOpenMs: 4000, lastWatchRatio: 0.9, hour: 14,
};
const frustrated: JourneySnapshot = {
  scrollPx: 14000, hovers: 25, opens: 0, bounces: 2, hunts: 4,
  dwellMs: 90000, sinceLastOpenMs: 90000, lastWatchRatio: 0.05, hour: 23,
};

describe('features', () => {
  it('produces N_FEATURES normalized values in [0,1]', () => {
    const f = extractFeatures(frustrated);
    expect(f.length).toBe(N_FEATURES);
    expect(f.every((x) => x >= 0 && x <= 1)).toBe(true);
  });

  it('defaults the research signals to 0 when absent (video-site back-compat)', () => {
    const f = extractFeatures(calm); // calm has no research fields
    expect(f.slice(10)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('research signals', () => {
  const savedAndEngaged: JourneySnapshot = { ...frustrated, deepOpens: 3, savedThisSession: true };
  const skimmingHunt: JourneySnapshot = { ...calm, abstractSkims: 4, queryRefines: 4, opens: 0 };

  it('backs off once the user deep-opens / saves this session', () => {
    const w = initialWeights();
    expect(predict(w, extractFeatures(savedAndEngaged))).toBeLessThan(predict(w, extractFeatures(frustrated)));
  });

  it('fires when the user skims abstracts and keeps refining queries', () => {
    const w = initialWeights();
    expect(predict(w, extractFeatures(skimmingHunt))).toBeGreaterThan(predict(w, extractFeatures(calm)));
  });
});

describe('policy predict', () => {
  it('is quiet when calm and fires when frustrated (with initial weights)', () => {
    const w = initialWeights();
    expect(predict(w, extractFeatures(calm))).toBeLessThan(0.3);
    expect(predict(w, extractFeatures(frustrated))).toBeGreaterThan(0.6);
  });
});

describe('online learning', () => {
  it('raises P(act) after positive labels on a state', () => {
    let w = initialWeights();
    const x = extractFeatures(frustrated);
    const before = predict(w, x);
    for (let i = 0; i < 20; i++) w = learn(w, x, 1);
    expect(predict(w, x)).toBeGreaterThan(before);
  });

  it('lowers P(act) after negative labels (learns not to interrupt this state)', () => {
    let w = initialWeights();
    const x = extractFeatures(frustrated);
    const before = predict(w, x);
    for (let i = 0; i < 30; i++) w = learn(w, x, 0);
    expect(predict(w, x)).toBeLessThan(before);
  });

  it('keeps weights bounded', () => {
    let w = initialWeights();
    const x = extractFeatures(frustrated);
    for (let i = 0; i < 500; i++) w = learn(w, x, 1);
    expect(w.w.every((wi) => Math.abs(wi) <= 6)).toBe(true);
    expect(Math.abs(w.b)).toBeLessThanOrEqual(6);
  });
});
