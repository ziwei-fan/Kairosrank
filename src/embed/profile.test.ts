import { describe, it, expect, beforeEach } from 'vitest';
import { getPreference, updatePreference, isConfident, rankByPreference, clearPreference } from './profile';

const store: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: 'test' },
    storage: {
      local: {
        get: async (k: string) => ({ [k]: store[k] }),
        set: async (o: Record<string, unknown>) => void Object.assign(store, o),
        remove: async (k: string) => void delete store[k],
      },
    },
  };
});

// unit vectors in 2-D for easy reasoning
const CRIME = [1, 0];
const ROMANCE = [0, 1];

describe('preference vector', () => {
  it('starts empty and not confident', async () => {
    expect(await getPreference('iyf')).toBeNull();
    expect(isConfident(null)).toBe(false);
  });

  it('becomes confident after enough positive signals and points toward liked content', async () => {
    await updatePreference('iyf', CRIME, 1);
    await updatePreference('iyf', CRIME, 1);
    await updatePreference('iyf', CRIME, 1);
    const pref = await getPreference('iyf');
    expect(isConfident(pref)).toBe(true);
    // ranks a crime item above a romance item
    const scores = rankByPreference(pref!, [
      { id: 'crime', vec: CRIME },
      { id: 'romance', vec: ROMANCE },
    ]);
    expect(scores.crime).toBeGreaterThan(scores.romance);
  });

  it('a negative signal pushes the vector away from the disliked item', async () => {
    await updatePreference('iyf', CRIME, 1); // seed toward crime
    const before = (await getPreference('iyf'))!.vector;
    await updatePreference('iyf', ROMANCE, -1); // dislike romance
    const after = (await getPreference('iyf'))!.vector;
    // similarity to romance should drop
    const simBefore = before[1];
    const simAfter = after[1];
    expect(simAfter).toBeLessThanOrEqual(simBefore);
  });

  it('ignores a negative signal when the profile is empty', async () => {
    await updatePreference('iyf', ROMANCE, -1);
    expect(await getPreference('iyf')).toBeNull();
  });

  it('clears', async () => {
    await updatePreference('iyf', CRIME, 1);
    await clearPreference('iyf');
    expect(await getPreference('iyf')).toBeNull();
  });
});
