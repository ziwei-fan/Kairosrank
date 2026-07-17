import { describe, it, expect, beforeEach } from 'vitest';
import { logEvent, getLog, clearLog, formatLog } from './interactionLog';

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

describe('interactionLog', () => {
  it('appends events and formats them as a timeline', async () => {
    await logEvent('iyf', 'open', '打开视频：胶囊计划第4季', 1_700_000_000_000);
    await logEvent('iyf', 'watch', '离开视频：胶囊计划第4季（共看了 40s）', 1_700_000_040_000);
    await logEvent('iyf', 'search', '搜索：“危险关系”', 1_700_000_050_000);
    const lines = formatLog(await getLog('iyf'));
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('打开视频：胶囊计划第4季');
    expect(lines[1]).toContain('共看了 40s');
    expect(lines[2]).toContain('危险关系');
    // each line is prefixed with a HH:MM clock stamp
    expect(lines[0]).toMatch(/^\d{2}:\d{2} /);
  });

  it('collapses immediate duplicate events', async () => {
    await logEvent('iyf', 'filter', '筛选：drama', 1);
    await logEvent('iyf', 'filter', '筛选：drama', 2); // dup → ignored
    await logEvent('iyf', 'filter', '筛选：movie', 3);
    expect((await getLog('iyf')).length).toBe(2);
  });

  it('clears the log', async () => {
    await logEvent('iyf', 'open', 'x', 1);
    await clearLog('iyf');
    expect(await getLog('iyf')).toEqual([]);
  });
});
