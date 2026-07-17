// Real-time interaction capture — the signals that reflect what the user wants
// RIGHT NOW: search queries, filter/genre/sort choices, and actual video playback.
// Feeds both the Monitor (when to interrupt) and the LLM (what to rank toward).

import { log } from '../logger';

export interface InteractionSnapshot {
  searches: string[]; // recent search queries (most recent last) — strongest intent
  filters: string[]; // active filter/sort tokens parsed from the URL
  playedProgress?: number; // 0..1, how far the user got in the current video
  played?: boolean; // did the current video actually start playing
}

function isSearchField(t: EventTarget | null): t is HTMLInputElement {
  if (!(t instanceof HTMLInputElement)) return false;
  const type = (t.type || '').toLowerCase();
  if (type && !['search', 'text', ''].includes(type)) return false;
  if (type === 'search' || t.getAttribute('role') === 'searchbox') return true;
  const hay = `${t.name} ${t.id} ${t.placeholder} ${t.getAttribute('aria-label') ?? ''}`.toLowerCase();
  return /search|搜索|搜寻|query|keyword/.test(hay);
}

export class Interactions {
  private searches: string[] = [];
  private filters: string[] = [];
  private videoEl: HTMLVideoElement | null = null;
  private maxProgress = 0;
  private played = false;

  constructor(
    private opts: {
      onHunt?: () => void;
      onPlay?: () => void;
      onSearch?: (query: string) => void;
      onFilter?: (tokens: string) => void;
    } = {},
  ) {}

  start(signal?: AbortSignal): void {
    document.addEventListener('keydown', this.onKeydown, { capture: true, signal });
  }

  private onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (isSearchField(t) && t.value.trim()) this.commitSearch(t.value.trim());
  };

  private commitSearch(q: string): void {
    if (this.searches[this.searches.length - 1] === q) return;
    this.searches.push(q);
    if (this.searches.length > 8) this.searches.shift();
    log(`interaction: search "${q}"`, '#a855f7');
    this.opts.onSearch?.(q);
    this.opts.onHunt?.();
  }

  // Filters/genres/sort live in the URL on both sites (e.g. /list/drama?region=大陆&orderBy=2).
  noteUrl(url: string): void {
    try {
      const u = new URL(url);
      const parts: string[] = [];
      const seg = u.pathname.split('/').filter(Boolean);
      if (seg[0] === 'list' && seg[1]) parts.push(seg[1]);
      u.searchParams.forEach((v, k) => {
        if (v) parts.push(`${k}=${decodeURIComponent(v)}`);
      });
      const next = parts.join(' · ');
      if (next && next !== this.filters.join(' · ')) {
        this.filters = parts;
        log(`interaction: filters → ${next}`, '#6b7280');
        this.opts.onFilter?.(next);
        this.opts.onHunt?.();
      }
    } catch {
      /* ignore */
    }
  }

  // Attach to the current video element to measure real playback (not just page dwell).
  attachVideo(): boolean {
    const v = document.querySelector('video');
    if (!v || v === this.videoEl) return !!this.videoEl;
    this.videoEl = v;
    this.maxProgress = 0;
    this.played = false;
    v.addEventListener('play', () => {
      this.played = true;
      this.opts.onPlay?.();
    });
    v.addEventListener('timeupdate', () => {
      if (v.duration > 0) this.maxProgress = Math.max(this.maxProgress, v.currentTime / v.duration);
    });
    log('interaction: attached to <video>', '#6b7280');
    return true;
  }

  watchForVideo(): void {
    let tries = 0;
    const t = window.setInterval(() => {
      tries++;
      if (this.attachVideo() || tries > 15) window.clearInterval(t);
    }, 700);
  }

  resetVideo(): void {
    this.videoEl = null;
    this.maxProgress = 0;
    this.played = false;
  }

  playedProgress(): number {
    return this.maxProgress;
  }

  snapshot(): InteractionSnapshot {
    return {
      searches: this.searches.slice(-5),
      filters: this.filters.slice(),
      playedProgress: this.videoEl ? Number(this.maxProgress.toFixed(2)) : undefined,
      played: this.videoEl ? this.played : undefined,
    };
  }
}
