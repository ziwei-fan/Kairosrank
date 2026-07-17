import { describe, it, expect } from 'vitest';
import { localTimeContext, fmtDur } from './session';

describe('localTimeContext', () => {
  it('describes evening on a weekend', () => {
    const s = localTimeContext(new Date(2026, 3, 18, 20, 40)); // Sat 2026-04-18 20:40 local
    expect(s).toContain('20:40');
    expect(s).toContain('evening');
    expect(s).toContain('weekend');
  });

  it('describes late night on a weekday', () => {
    const s = localTimeContext(new Date(2026, 3, 20, 2, 5)); // Mon 02:05 local
    expect(s).toContain('02:05');
    expect(s).toContain('late night');
    expect(s).toContain('weekday');
  });
});

describe('fmtDur', () => {
  it('formats seconds and minutes', () => {
    expect(fmtDur(4000)).toBe('4s');
    expect(fmtDur(125000)).toBe('2m');
  });
});
