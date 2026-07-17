// Per-site preference vector: a running centroid of embeddings of items the user
// engaged with (＋) or abandoned (－). Drives the silent embedding re-rank.

import { blendCentroid, cosine } from './vec';
import { extAlive } from '../rerank/ext';

export interface Preference {
  vector: number[];
  count: number; // number of engagement signals folded in (confidence proxy)
}

const CONFIDENCE_MIN = 3; // need at least this many signals before we trust a silent reorder
const BASE_ALPHA = 0.35; // blend rate

const key = (siteId: string) => `pref:${siteId}`;

export async function getPreference(siteId: string): Promise<Preference | null> {
  if (!extAlive()) return null;
  const got = await chrome.storage.local.get(key(siteId));
  return (got[key(siteId)] as Preference | undefined) ?? null;
}

export function isConfident(pref: Preference | null): boolean {
  return !!pref && pref.count >= CONFIDENCE_MIN && pref.vector.length > 0;
}

// signal in [-1, 1]: positive = liked (blend toward), negative = disliked (blend away).
export async function updatePreference(siteId: string, vec: number[], signal: number): Promise<void> {
  if (!extAlive() || !vec.length || signal === 0) return;
  const stored = await getPreference(siteId);
  // Discard a stored vector of a different dimension (e.g. from a previous embedding
  // model) — blending mismatched dims would corrupt the centroid. Start fresh instead.
  const cur = stored && stored.vector.length === vec.length ? stored : null;
  if (!cur && signal < 0) return; // can't push away from an empty profile
  const vector = blendCentroid(cur?.vector ?? null, vec, BASE_ALPHA * signal);
  const next: Preference = { vector, count: (cur?.count ?? 0) + 1 };
  await chrome.storage.local.set({ [key(siteId)]: next });
}

export async function clearPreference(siteId: string): Promise<void> {
  if (!extAlive()) return;
  await chrome.storage.local.remove(key(siteId));
}

// Rank item ids by cosine similarity of their embedding to the preference vector.
export function rankByPreference(
  pref: Preference,
  items: { id: string; vec: number[] }[],
): Record<string, number> {
  const scores: Record<string, number> = {};
  // Guard against a stale-dimension preference vector (old embedding model).
  if (items.length && pref.vector.length !== items[0].vec.length) return scores;
  for (const it of items) {
    // cosine → 0..1 (embeddings are normalized so cosine ∈ [-1,1]; shift to [0,1])
    scores[it.id] = (cosine(pref.vector, it.vec) + 1) / 2;
  }
  return scores;
}
