// Tiny online-learning "when-to-interact" classifier: logistic regression over the
// journey feature vector. Predicts P(act now) in microseconds, and nudges its own
// weights from the user's reactions (engage → +, dismiss/undo → −) via SGD.

import { N_FEATURES } from './features';
import { extAlive } from './ext';

export interface PolicyWeights {
  w: number[];
  b: number;
}

const LR = 0.05; // learning rate (low → stable, resists drift from noisy signals)
const WCLAMP = 6; // clamp weights to avoid runaway
const key = (siteId: string) => `policy:${siteId}`;

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}
const clampW = (x: number) => Math.max(-WCLAMP, Math.min(WCLAMP, x));

// Sensible starting weights that encode the old heuristic: bounces / hunts / scroll /
// dwell / no-open-yet / short-last-watch all push toward interacting. Bias is negative
// so the default state is "don't act" until evidence accumulates.
export function initialWeights(): PolicyWeights {
  const w = new Array(N_FEATURES).fill(0);
  // indices per FEATURE_NAMES: 0 scroll,1 hovers,2 opens,3 bounces,4 hunts,5 dwell,
  //                            6 sinceLastOpen,7 noOpenYet,8 lastDissatisfaction,9 lateNight
  w[0] = 0.8; // scroll
  w[1] = 0.4; // hovers
  w[2] = -0.6; // more opens → engaged already → less need
  w[3] = 1.6; // bounces
  w[4] = 1.3; // hunts
  w[5] = 0.9; // dwell
  w[6] = 0.6; // since last open
  w[7] = 1.0; // no open yet
  w[8] = 1.0; // last watch was short
  w[9] = 0.3; // late night
  // research/discovery signals
  w[10] = 1.4; // abstractSkims — skimmed abstracts, nothing stuck (mirror bounces)
  w[11] = -1.0; // deepOpens — opened pdf/code/download → engaged, don't interrupt
  w[12] = 1.1; // queryRefines — repeated searching with no commit → hunting
  w[13] = 0.7; // staleFraction — most of this list already seen → offer a fresh ranking
  w[14] = -1.5; // savedThisSession — just saved something → satisfied, back off
  w[15] = -0.5; // revisit — came back to a seen listing
  return { w, b: -2.6 };
}

export function predict(pw: PolicyWeights, x: number[]): number {
  let z = pw.b;
  for (let i = 0; i < pw.w.length; i++) z += pw.w[i] * x[i];
  return sigmoid(z);
}

// One SGD step toward `label` (1 = should have acted, 0 = should not have).
export function learn(pw: PolicyWeights, x: number[], label: number, lr = LR): PolicyWeights {
  const p = predict(pw, x);
  const err = label - p;
  const w = pw.w.map((wi, i) => clampW(wi + lr * err * x[i]));
  const b = clampW(pw.b + lr * err);
  return { w, b };
}

export async function loadWeights(siteId: string): Promise<PolicyWeights> {
  if (!extAlive()) return initialWeights();
  const got = await chrome.storage.local.get(key(siteId));
  const saved = got[key(siteId)] as PolicyWeights | undefined;
  if (saved && Array.isArray(saved.w)) {
    if (saved.w.length === N_FEATURES) return saved;
    // Pad-migrate an older, shorter weight vector: KEEP the learned weights and append
    // the new features' defaults (so the 10→16 feature bump doesn't wipe learning).
    if (saved.w.length < N_FEATURES) {
      const init = initialWeights();
      const w = init.w.map((d, i) => (i < saved.w.length ? saved.w[i] : d));
      return { w, b: saved.b };
    }
  }
  return initialWeights();
}

export async function saveWeights(siteId: string, pw: PolicyWeights): Promise<void> {
  if (!extAlive()) return;
  await chrome.storage.local.set({ [key(siteId)]: pw });
}
