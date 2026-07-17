// Ephemeral current-session behavior signals (this visit only).
import type { Card } from '../sites/types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function localTimeContext(now: Date = new Date()): string {
  const h = now.getHours();
  const part =
    h < 5 ? 'late night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'late night';
  const hh = String(h).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const kind = now.getDay() === 0 || now.getDay() === 6 ? 'weekend' : 'weekday';
  return `${DAYS[now.getDay()]} ${hh}:${mm} (${part}, ${kind}) — user's local time`;
}

export function fmtDur(ms: number): string {
  return ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)}m`;
}

export function currentSelection(): string {
  return (window.getSelection?.()?.toString() ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

// Tracks how long the pointer lingers on each card (interest signal).
const LINGER_LOG_MS = 3000; // report a "linger" to the log once dwell passes this

export class HoverTracker {
  private dwell = new Map<string, number>();
  private titles = new Map<string, string>();
  private logged = new Set<string>();
  private bound: { el: HTMLElement; enter: () => void; leave: () => void }[] = [];

  constructor(
    private onEnter?: () => void,
    private onLinger?: (title: string, ms: number) => void,
  ) {}

  attach(cards: Card[]): void {
    this.detach();
    for (const c of cards) {
      let enterT = 0;
      const enter = () => {
        enterT = performance.now();
        this.onEnter?.();
      };
      const leave = () => {
        if (!enterT) return;
        const d = performance.now() - enterT;
        enterT = 0;
        if (d < 250) return; // ignore quick pass-overs
        const total = (this.dwell.get(c.id) ?? 0) + d;
        this.dwell.set(c.id, total);
        this.titles.set(c.id, c.title);
        // Log a notable linger once (raw event — the LLM decides what it means).
        if (total >= LINGER_LOG_MS && !this.logged.has(c.id)) {
          this.logged.add(c.id);
          this.onLinger?.(c.title, total);
        }
      };
      c.el.addEventListener('mouseenter', enter);
      c.el.addEventListener('mouseleave', leave);
      this.bound.push({ el: c.el, enter, leave });
    }
  }

  detach(): void {
    for (const b of this.bound) {
      b.el.removeEventListener('mouseenter', b.enter);
      b.el.removeEventListener('mouseleave', b.leave);
    }
    this.bound = [];
  }

  // Titles the user lingered on, longest first, with dwell duration.
  top(n = 6): string[] {
    return [...this.dwell.entries()]
      .filter(([, ms]) => ms >= 600)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id, ms]) => `${this.titles.get(id) ?? id} (${fmtDur(ms)})`);
  }
}
