import { describe, it, expect, beforeEach } from 'vitest';
import { getSiteMemory, recordOpen, recordAnswer, recordWatch, clearSiteMemory } from './memory';

// Minimal chrome.storage.local mock.
const store: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: 'test' },
    storage: {
      local: {
        get: async (k: string) => ({ [k]: store[k] }),
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
        remove: async (k: string) => {
          delete store[k];
        },
      },
    },
  };
});

describe('memory store', () => {
  it('starts empty', async () => {
    const m = await getSiteMemory('iyf');
    expect(m.clicks).toEqual([]);
    expect(m.answers).toEqual([]);
  });

  it('records opens and de-dupes by id (keeps most recent)', async () => {
    await recordOpen('iyf', '/play/a', 'A');
    await recordOpen('iyf', '/play/b', 'B');
    await recordOpen('iyf', '/play/a', 'A'); // re-open A → moves to end, no dup
    const m = await getSiteMemory('iyf');
    expect(m.clicks.map((c) => c.title)).toEqual(['B', 'A']);
    expect(m.clicks.length).toBe(2);
  });

  it('counts distinct videos even when titles collide', async () => {
    await recordOpen('iyf', '/play/x', 'same');
    await recordOpen('iyf', '/play/y', 'same');
    expect((await getSiteMemory('iyf')).clicks.length).toBe(2);
  });

  it('records answers', async () => {
    await recordAnswer('iyf', '悬疑 or 爱情?', '悬疑');
    const m = await getSiteMemory('iyf');
    expect(m.answers[0]).toMatchObject({ question: '悬疑 or 爱情?', answer: '悬疑' });
  });

  it('keeps memory separate per site', async () => {
    await recordOpen('iyf', '/play/x', 'X');
    await recordOpen('siteB', '/cn/y', 'Y');
    expect((await getSiteMemory('iyf')).clicks.map((c) => c.title)).toEqual(['X']);
    expect((await getSiteMemory('siteB')).clicks.map((c) => c.title)).toEqual(['Y']);
  });

  it('clears a site', async () => {
    await recordOpen('iyf', '/play/x', 'X');
    await clearSiteMemory('iyf');
    expect((await getSiteMemory('iyf')).clicks).toEqual([]);
  });

  it('accrues watch time per video', async () => {
    await recordOpen('iyf', '/play/w', 'Watched Movie');
    await recordWatch('iyf', '/play/w', 'Watched Movie', 180000);
    const mem = await getSiteMemory('iyf');
    expect(mem.clicks.find((c) => c.id === '/play/w')?.watchMs).toBe(180000);
  });

  it('recordWatch upserts if the video was not opened first', async () => {
    await recordWatch('siteB', '/cn/z', 'Z', 5000);
    expect((await getSiteMemory('siteB')).clicks[0]).toMatchObject({ id: '/cn/z', watchMs: 5000 });
  });
});
