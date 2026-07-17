// Persistent, local, per-site memory of opened videos + watch time + answers.
// Used by the Monitor (bounce/commit) and the watch report. The LLM sees the raw
// interaction timeline (interactionLog.ts), not this structured store.

import { extAlive } from './ext';

export interface ClickRecord {
  id: string; // stable per-video id (pathname); de-dupe key
  title: string;
  ts: number;
  watchMs?: number; // cumulative time spent on this video's page (proxy for "watched")
}
export interface AnswerRecord {
  question: string;
  answer: string;
  ts: number;
}
export interface SiteMemory {
  clicks: ClickRecord[];
  answers: AnswerRecord[];
}

const MAX_CLICKS = 40;
const MAX_ANSWERS = 20;
// How much to actually feed the LLM (keep the prompt compact).

const key = (siteId: string) => `memory:${siteId}`;

export async function getSiteMemory(siteId: string): Promise<SiteMemory> {
  if (!extAlive()) return { clicks: [], answers: [] };
  const k = key(siteId);
  const got = await chrome.storage.local.get(k);
  const m = got[k] as SiteMemory | undefined;
  // Always return fresh arrays so callers never mutate shared/stored references.
  return { clicks: [...(m?.clicks ?? [])], answers: [...(m?.answers ?? [])] };
}

async function save(siteId: string, mem: SiteMemory): Promise<void> {
  if (!extAlive()) return;
  await chrome.storage.local.set({ [key(siteId)]: mem });
}

export async function recordOpen(siteId: string, id: string, title: string): Promise<SiteMemory> {
  const vid = id.trim();
  const t = title.trim();
  if (!vid) return getSiteMemory(siteId);
  const mem = await getSiteMemory(siteId);
  // de-dupe by stable id (re-opening moves it to most-recent), keep best title seen
  const prev = mem.clicks.find((c) => c.id === vid);
  mem.clicks = mem.clicks.filter((c) => c.id !== vid);
  mem.clicks.push({ id: vid, title: t || prev?.title || vid, ts: Date.now() });
  mem.clicks = mem.clicks.slice(-MAX_CLICKS);
  await save(siteId, mem);
  return mem;
}

export async function recordAnswer(siteId: string, question: string, answer: string): Promise<SiteMemory> {
  const mem = await getSiteMemory(siteId);
  mem.answers.push({ question: question.trim(), answer: answer.trim(), ts: Date.now() });
  mem.answers = mem.answers.slice(-MAX_ANSWERS);
  await save(siteId, mem);
  return mem;
}

// Add watch time to a video (upserts the open record). Called by the page-visible
// heartbeat, so it persists incrementally and never loses time to an unload race.
export async function recordWatch(siteId: string, id: string, title: string, deltaMs: number): Promise<void> {
  if (!id || deltaMs <= 0) return;
  const mem = await getSiteMemory(siteId);
  let rec = mem.clicks.find((c) => c.id === id);
  if (!rec) {
    rec = { id, title: title || id, ts: Date.now(), watchMs: 0 };
    mem.clicks.push(rec);
  }
  rec.watchMs = (rec.watchMs ?? 0) + deltaMs;
  rec.ts = Date.now();
  mem.clicks = mem.clicks.slice(-MAX_CLICKS);
  await save(siteId, mem);
}

export async function clearSiteMemory(siteId: string): Promise<void> {
  if (!extAlive()) return;
  await chrome.storage.local.remove(key(siteId));
}
