// A raw, append-only timeline of the user's interactions. We do NOT interpret it
// (no like/dislike/bounce classification) — we just record what happened and hand
// the timeline to the LLM, which decides what it means for ranking.

import { extAlive } from './ext';

export type LogKind = 'open' | 'watch' | 'search' | 'filter' | 'linger' | 'answer' | 'scan';

export interface LogEntry {
  ts: number;
  kind: LogKind;
  detail: string; // self-describing, in the user's language
}

const MAX_ENTRIES = 80;
const CONTEXT_ENTRIES = 30;
const key = (siteId: string) => `ilog:${siteId}`;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export async function getLog(siteId: string): Promise<LogEntry[]> {
  if (!extAlive()) return [];
  const got = await chrome.storage.local.get(key(siteId));
  return (got[key(siteId)] as LogEntry[] | undefined) ?? [];
}

export async function logEvent(siteId: string, kind: LogKind, detail: string, ts: number): Promise<void> {
  if (!extAlive()) return;
  const arr = await getLog(siteId);
  const last = arr[arr.length - 1];
  // collapse immediate duplicates (e.g. repeated filter/linger on the same thing)
  if (last && last.kind === kind && last.detail === detail) return;
  arr.push({ ts, kind, detail });
  await chrome.storage.local.set({ [key(siteId)]: arr.slice(-MAX_ENTRIES) });
}

export async function clearLog(siteId: string): Promise<void> {
  if (!extAlive()) return;
  await chrome.storage.local.remove(key(siteId));
}

// Render the recent tail as a plain timeline for the LLM.
export function formatLog(entries: LogEntry[]): string[] {
  return entries.slice(-CONTEXT_ENTRIES).map((e) => {
    const d = new Date(e.ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())} ${e.detail}`;
  });
}
