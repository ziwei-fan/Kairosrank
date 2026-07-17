// Pure vector math — no Transformers.js import, safe to use in the service worker.

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// L2-normalize a vector in place-safe manner (returns a new array).
export function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

// Weighted running centroid update: blend `vec` (weight w) into `centroid`.
export function blendCentroid(centroid: number[] | null, vec: number[], w: number): number[] {
  if (!centroid) return vec.slice();
  const out = centroid.map((c, i) => c + w * (vec[i] - c));
  return normalize(out);
}
