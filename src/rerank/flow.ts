import { pickSite, collectCards, probe, type Card } from '../sites';
import { mountPanel, type PanelHandle } from './panel';
import { snapshot, restore, reorder, setHidden, type Snapshot } from './reorder';
import { getSiteMemory, recordOpen, recordAnswer, recordWatch, clearSiteMemory } from './memory';
import { logEvent, getLog, clearLog, formatLog } from './interactionLog';
import { HoverTracker, localTimeContext, currentSelection, fmtDur } from './session';
import { Monitor } from './monitor';
import { Interactions } from './interactions';
import { extAlive } from './ext';
import { extractFeatures } from './features';
import { predict, learn, loadWeights, saveWeights, type PolicyWeights, initialWeights } from './policy';
import {
  getPreference,
  updatePreference,
  isConfident,
  rankByPreference,
  clearPreference,
} from '../embed/profile';
import { getSettings, setSettings } from '../storage';
import type { Request, Response, Question, Answer, PriorTurn, Sample } from '../messages';
import { log, warn } from '../logger';

const WATCH_HEARTBEAT_MS = 5000;
const MONITOR_TICK_MS = 6000;
const NAV_POLL_MS = 600;
const ACT_THRESHOLD = 0.6; // P(act) above which the tiny model fires a silent re-rank
const LEARN_WINDOW_MS = 45000; // if the user opens a video within this after a fire → positive label
const WATCH_LIKE_MS = 120000; // watched ≥ this → strong like
const WATCH_BOUNCE_MS = 20000; // watched < this → dislike

// Minimal shape of WXT's ContentScriptContext (self-cancelling timers + abort signal).
export interface RerankCtx {
  setInterval(cb: () => void, ms: number): number;
  setTimeout(cb: () => void, ms: number): number;
  signal: AbortSignal;
}

async function send(req: Request): Promise<Response> {
  if (!extAlive()) throw new Error('扩展已重新加载，请刷新页面');
  return chrome.runtime.sendMessage(req);
}

export function startRerank(ctx: RerankCtx): void {
  const site = pickSite(location.hostname);
  if (!site) return;
  const sid = site.id; // non-null capture for hoisted closures

  // ctx-managed timers/listeners stop firing once the extension context dies,
  // so a dev reload doesn't leave old intervals hammering chrome.*.
  const every = (cb: () => void, ms: number) => ctx.setInterval(cb, ms);
  const after = (cb: () => void, ms: number) => ctx.setTimeout(cb, ms);
  const on = (
    target: Window | Document,
    type: string,
    handler: EventListenerOrEventListenerObject,
    opts: AddEventListenerOptions = {},
  ) => target.addEventListener(type, handler, { ...opts, signal: ctx.signal });

  // Expose probe + memory inspection for live tuning.
  (window as unknown as Record<string, unknown>).__jitProbe = () => probe(document, site);
  (window as unknown as Record<string, unknown>).__jitMemory = {
    get: () => getSiteMemory(site.id),
    clear: () => clearSiteMemory(site.id),
  };
  // Readable per-video watch-time report.
  (window as unknown as Record<string, unknown>).__jitWatch = async () => {
    const m = await getSiteMemory(site.id);
    const toLink = (id: string) => {
      try {
        return new URL(id, location.origin).href;
      } catch {
        return id;
      }
    };
    const rows = [...m.clicks]
      .sort((a, b) => (b.watchMs ?? 0) - (a.watchMs ?? 0))
      .map((c) => ({
        title: c.title.slice(0, 50),
        watched: c.watchMs ? fmtDur(c.watchMs) : '—',
        link: toLink(c.id),
        lastSeen: new Date(c.ts).toLocaleString(),
      }));
    // eslint-disable-next-line no-console
    console.table(rows);
    return rows;
  };
  // The raw interaction timeline the LLM is given.
  (window as unknown as Record<string, unknown>).__jitLog = async () => {
    const lines = formatLog(await getLog(site.id));
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    return lines;
  };
  // Inspect the "when-to-interact" model + preference profile.
  (window as unknown as Record<string, unknown>).__jitPolicy = async () => {
    const pref = await getPreference(site.id);
    const feats = extractFeatures(monitor.journeySnapshot(Date.now(), await recentWatchRatio()));
    return {
      pAct: Number(predict(weights, feats).toFixed(3)),
      willFire: predict(weights, feats) >= ACT_THRESHOLD,
      confidentProfile: isConfident(pref),
      prefSignals: pref?.count ?? 0,
      features: feats,
      weights,
    };
  };
  log(`Kairosrank on ${site.label}`, '#3b82f6');

  let cards: Card[] = [];
  let snaps: Snapshot[] = [];
  let autoSuggest = true;
  let proactive = false; // auto-open + ask on page load (opt-in)
  let hideSeen = false; // hide items already opened on this site (triage aid)
  let interacting = false; // a round or an offer is currently on screen
  let currentVideo = site.videoPage(location.href); // the video page we're on, if any
  let watchAnchor = Date.now(); // last time we credited watch to currentVideo
  let lastUrl = location.href; // for SPA navigation detection
  const turns: { question: Question; answer: Answer }[] = [];
  let weights: PolicyWeights = initialWeights(); // the online "when-to-interact" model
  let pendingLearn: { feats: number[]; timer: number } | null = null;
  const monitor = new Monitor(site.id, Date.now());
  const hover = new HoverTracker(
    () => monitor.noteHover(),
    (title, ms) => void logEvent(site.id, 'linger', `停留在：${title}（${fmtDur(ms)}）`, Date.now()),
  );
  const interactions = new Interactions({
    onHunt: () => monitor.noteHunt(),
    onSearch: (q) => {
      void logEvent(site.id, 'search', `搜索：“${q}”`, Date.now());
      void learnPreference(q, 0.8); // a search is a strong stated preference
    },
    onFilter: (tokens) => void logEvent(site.id, 'filter', `筛选：${tokens}`, Date.now()),
  });

  const refreshMemoryBadge = async () => {
    const m = await getSiteMemory(site.id);
    panel.setMemory(m.clicks.length, m.answers.length);
  };

  const panel: PanelHandle = mountPanel({
    siteLabel: site.id,
    onUndo: () => {
      restore(snaps);
      turns.length = 0;
      void resolveLearn(0, 'undo'); // undo = that re-rank was unwelcome
      panel.status('Reverted to original order.');
    },
    onAskAnother: () => void runRound(),
    onForget: () => {
      void Promise.all([clearSiteMemory(site.id), clearLog(site.id), clearPreference(site.id)]).then(refreshMemoryBadge);
      weights = initialWeights();
      void saveWeights(site.id, weights);
      panel.status('Memory + preference profile cleared for this site.');
    },
    onToggleAuto: (on) => {
      autoSuggest = on;
      void setSettings({ autoSuggest: on });
      log(`auto-suggest ${on ? 'ON' : 'OFF'}`, '#6b7280');
    },
    onToggleProactive: (on) => {
      proactive = on;
      void setSettings({ proactive: on });
      log(`ask-on-arrival ${on ? 'ON' : 'OFF'}`, '#6b7280');
      // Turning it on with cards ready gives immediate feedback.
      if (on && !interacting && turns.length === 0 && !site.videoPage(location.href) && cards.length >= 4) {
        void runRound();
      }
    },
    onToggleHideSeen: async (on) => {
      hideSeen = on;
      void setSettings({ hideSeen: on });
      log(`hide-seen ${on ? 'ON' : 'OFF'}`, '#6b7280');
      const hidden = await applyHideSeen();
      // Explain the outcome — a silent "0 hidden" reads as broken.
      if (!on) {
        panel.status('Showing all items again.');
      } else if (hidden > 0) {
        panel.status(`🙈 Hid ${hidden} item${hidden > 1 ? 's' : ''} you've already opened.`);
      } else {
        const mem = await getSiteMemory(site.id);
        panel.status(
          mem.clicks.length
            ? "None of the items on this page are ones you've opened, so nothing to hide here."
            : "Nothing to hide yet — this hides items only after you open them.",
        );
      }
    },
    onOpen: () => {
      // Manual entry point: user clicked the pill.
      if (interacting) return;
      if (turns.length > 0) return; // already have a conversation open; leave results
      // On an item/detail page (a specific model / paper / video) there's no list to
      // re-rank — visiting it already fed your profile. Don't try to detect a grid.
      if (site.videoPage(location.href)) {
        panel.expand();
        panel.status('This is an item page — open a listing (search / models / datasets) to re-rank.');
        return;
      }
      void runRound();
    },
    onCollapse: () => {},
  });

  void refreshMemoryBadge();

  // ---- Per-video dwell tracking (follows SPA navigation) ----
  // Credit the *visible* time spent on the current video, incrementally so an
  // unload/navigation never loses it. watchAnchor marks the last credited instant.
  const creditWatch = (): void => {
    const now = Date.now();
    if (currentVideo && document.visibilityState === 'visible') {
      const delta = now - watchAnchor;
      if (delta > 500) {
        void recordWatch(site.id, currentVideo.id, currentVideo.title, delta).then(refreshMemoryBadge);
      }
    }
    watchAnchor = now;
  };

  const recordCurrentOpen = (): void => {
    if (!currentVideo) return;
    void recordOpen(site.id, currentVideo.id, currentVideo.title).then(refreshMemoryBadge);
    void monitor.noteOpen(currentVideo.id);
    void logEvent(site.id, 'open', `打开视频：${currentVideo.title}`, Date.now());
    void learnPreference(currentVideo.title, 0.3); // opening = mild interest
    // Opening a video shortly after a silent re-rank = it surfaced something they wanted.
    if (pendingLearn) void resolveLearn(1, 'opened after rerank');
    log(`open: ${currentVideo.title} (${currentVideo.id})`, '#6b7280');
  };

  // Embed texts on-device (offscreen model, via the background broker).
  const embedTexts = async (texts: string[]): Promise<number[][]> => {
    const resp = await send({ kind: 'embed', texts });
    if (!resp.ok || !('vectors' in resp)) throw new Error(resp.ok ? 'no vectors' : resp.error);
    return resp.vectors;
  };

  // Fold an engaged item into the per-site preference vector (all on-device).
  const learnPreference = async (text: string, signal: number): Promise<void> => {
    if (!text.trim() || signal === 0) return;
    try {
      const [vec] = await embedTexts([text]);
      await updatePreference(site.id, vec, signal);
      log(`pref ${signal > 0 ? '＋' : '－'}${Math.abs(signal).toFixed(1)}: ${text.slice(0, 30)}`, '#6b7280');
    } catch {
      /* embedder not ready — skip */
    }
  };

  // Log the total watch time for a video we're leaving + fold it into the profile.
  const logWatch = async (video: { id: string; title: string }): Promise<void> => {
    const mem = await getSiteMemory(site.id);
    const ms = mem.clicks.find((c) => c.id === video.id)?.watchMs ?? 0;
    await logEvent(site.id, 'watch', `离开视频：${video.title}（共看了 ${fmtDur(ms)}）`, Date.now());
    const signal = ms >= WATCH_LIKE_MS ? 1 : ms < WATCH_BOUNCE_MS ? -0.5 : 0.3;
    await learnPreference(video.title, signal);
  };

  // How satisfied was the last video (watch time as a rough ratio) — a policy feature.
  const recentWatchRatio = async (): Promise<number> => {
    const mem = await getSiteMemory(site.id);
    const last = mem.clicks[mem.clicks.length - 1];
    if (!last?.watchMs) return 1;
    return Math.min(last.watchMs / WATCH_LIKE_MS, 1);
  };

  // SILENT, on-device re-rank by the local preference vector — no question, no LLM.
  const silentRerank = async (moment: string): Promise<boolean> => {
    const pref = await getPreference(site.id);
    if (!isConfident(pref)) {
      log(`silent rerank skipped @ ${moment}: profile not confident yet`, '#6b7280');
      return false;
    }
    if (!detect()) return false; // re-detect fresh cards (SPA may have re-rendered)
    interacting = true;
    try {
      const t0 = Date.now();
      const vectors = await embedTexts(cards.map((c) => `${c.title} ${c.tags}`));
      const items = cards.map((c, i) => ({ id: c.id, vec: vectors[i] }));
      const scores = rankByPreference(pref!, items);
      if (snaps.length === 0) snaps = snapshot(cards);
      const { moved, changed } = reorder(cards, scores);
      await applyHideSeen(); // honor "hide seen" after a silent re-rank too
      panel.setPillLabel(`re-ranked · ${cards.length}`);
      panel.status(`Silently re-ranked ${moved} items by your profile (on-device, ${Date.now() - t0}ms)`);
      panel.setPostRerank();
      log(`silent rerank @ ${moment}: ${moved} moved, changed=${changed}, ${Date.now() - t0}ms`, '#10b981');
      return changed > 0;
    } catch (e) {
      log(`silent rerank failed: ${String((e as Error).message ?? e)}`, '#ef4444');
      return false;
    } finally {
      interacting = false;
    }
  };

  // "Hide seen" toggle: reversibly hide items already opened on this site, so the
  // listing shows only fresh content. Reused after every detect/reorder.
  const applyHideSeen = async (): Promise<number> => {
    if (!cards.length) return 0;
    if (!hideSeen) {
      setHidden(cards, new Set()); // reveal everything
      return 0;
    }
    const mem = await getSiteMemory(site.id);
    const seen = new Set(mem.clicks.map((c) => c.id));
    const { hidden } = setHidden(cards, seen);
    if (hidden) log(`hide-seen: hid ${hidden} already-opened item(s)`, '#6b7280');
    return hidden;
  };

  // On-page "more like this": rank the whole list by similarity to ONE clicked item.
  // Transient — does NOT mutate the stored preference profile and skips the confidence
  // gate. The clicked item's own embedding is used as a one-item centroid.
  const moreLikeThis = async (card: Card): Promise<void> => {
    if (interacting) return;
    interacting = true;
    try {
      panel.expand();
      const label = card.title.slice(0, 40);
      panel.status(`Finding items like “${label}”…`);
      const vectors = await embedTexts(cards.map((c) => `${c.title} ${c.tags}`));
      const idx = cards.findIndex((c) => c.id === card.id);
      if (idx < 0 || !vectors[idx]) throw new Error('could not embed the clicked item');
      const items = cards.map((c, i) => ({ id: c.id, vec: vectors[i] }));
      const scores = rankByPreference({ vector: vectors[idx], count: 1 }, items);
      if (snaps.length === 0) snaps = snapshot(cards);
      const { moved } = reorder(cards, scores);
      await applyHideSeen();
      panel.status(`Showing items like “${label}” · ${moved} ranked (Undo to reset)`);
      const ranked = cards.map((c) => ({ title: c.title, score: scores[c.id] ?? 0 })).sort((a, b) => b.score - a.score);
      panel.showRanked(ranked);
      panel.setPostRerank();
      log(`more-like-this: ${card.title}`, '#10b981');
    } catch (e) {
      panel.status(`more-like-this failed: ${String((e as Error).message ?? e)}`, 'error');
    } finally {
      interacting = false;
    }
  };

  // ⌥/Alt-click any card → "more like this" instead of navigating. Capture phase so we
  // intercept before the site's own click handler / link navigation.
  on(
    document,
    'click',
    (ev) => {
      const e = ev as MouseEvent;
      if (!e.altKey || interacting || !cards.length) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const card = cards.find((c) => {
        const els = c.unit ?? [c.el];
        return els.some((el) => el.contains(target) || target.contains(el));
      });
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      void moreLikeThis(card);
    },
    { capture: true },
  );

  // Online learning: after a fire, wait for the user's implicit reaction.
  function scheduleLearn(feats: number[]): void {
    if (pendingLearn?.timer) window.clearTimeout(pendingLearn.timer);
    const timer = after(() => void resolveLearn(0, 'no open in window'), LEARN_WINDOW_MS);
    pendingLearn = { feats, timer };
  }
  async function resolveLearn(label: number, why: string): Promise<void> {
    if (!pendingLearn) return;
    const { feats, timer } = pendingLearn;
    window.clearTimeout(timer);
    pendingLearn = null;
    weights = learn(weights, feats, label);
    await saveWeights(sid, weights);
    log(`policy learn: label=${label} (${why})`, label ? '#10b981' : '#f59e0b');
  }

  // Real-time interaction capture (search / filters / playback).
  interactions.start(ctx.signal);
  interactions.noteUrl(location.href);
  if (currentVideo) interactions.watchForVideo();

  // Record the open for the page we LOADED on (full page load / refresh).
  recordCurrentOpen();

  every(creditWatch, WATCH_HEARTBEAT_MS);
  on(document, 'visibilitychange', () => {
    creditWatch(); // credit time up to the moment of hide; reset anchor on show
  });
  on(window, 'pagehide', creditWatch);

  // Parallel monitor: feed scroll distance + evaluate at good moments (scroll pauses).
  let lastY = window.scrollY;
  let scrollPauseTimer: number | undefined;
  on(
    window,
    'scroll',
    () => {
      monitor.noteScroll(window.scrollY - lastY);
      lastY = window.scrollY;
      if (scrollPauseTimer) window.clearTimeout(scrollPauseTimer);
      scrollPauseTimer = after(() => void tryInterrupt('scroll-pause'), 900);
    },
    { passive: true },
  );

  // The ONE decision point. The tiny online model reads the journey and decides
  // whether to act NOW; if so, fire a SILENT on-device re-rank (no question, no LLM).
  const tryInterrupt = async (moment: string): Promise<void> => {
    if (!autoSuggest || interacting || turns.length > 0) return;
    if (currentVideo || cards.length < 4) return; // only on a ready listing
    const now = Date.now();
    const g = monitor.gate(now); // budget / cooldown / suppression
    if (!g.ok) return;
    const feats = extractFeatures(monitor.journeySnapshot(now, await recentWatchRatio()));
    const p = predict(weights, feats);
    if (p < ACT_THRESHOLD) return;
    log(`policy fire @ ${moment}: P(act)=${p.toFixed(2)}`, '#a855f7');
    await monitor.markOffered(now); // consume budget + start cooldown
    await silentRerank(moment);
    scheduleLearn(feats); // learn from what the user does next
  };
  every(() => void tryInterrupt('idle-tick'), MONITOR_TICK_MS);

  const detect = (): boolean => {
    const res = collectCards(document, site);
    cards = res.cards;
    if (cards.length < 4) {
      panel.status('No re-rankable list detected on this page. Open a listing/search page.', 'error');
      log(`detect: 0 usable cards. probe=${JSON.stringify(probe(document, site))}`, '#f59e0b');
      return false;
    }
    panel.showCards(cards.length);
    panel.setPillLabel(`re-rank · ${cards.length}`);
    hover.attach(cards); // track pointer dwell per card
    void applyHideSeen(); // honor the "hide seen" toggle on the freshly-detected cards
    log(`detect: ${cards.length} cards via "${res.usedSelector}"`);
    return true;
  };

  const runRound = async (): Promise<void> => {
    if (!detect()) return;
    interacting = true;
    panel.expand();
    try {
      // Raw interaction timeline + live signals → LLM context. The LLM interprets it.
      const behavior = {
        interactions: formatLog(await getLog(site.id)),
        localTime: localTimeContext(),
        selection: currentSelection() || undefined,
      };

      panel.status('Generating question…');
      const samples: Sample[] = cards.slice(0, 30).map((c) => ({ id: c.id, title: c.title }));
      const priorTurns: PriorTurn[] = turns.map((t) => ({
        questionText: t.question.text,
        chosenLabel: t.question.options.find((o) => o.id === t.answer.optionId)?.label ?? '?',
      }));

      const qStart = Date.now();
      const qResp = await send({ kind: 'questions', siteId: site.id, samples, priorTurns, behavior });
      const questionMs = Date.now() - qStart;
      if (!qResp.ok || !('questions' in qResp)) throw new Error(qResp.ok ? 'bad response' : qResp.error);
      const question = qResp.questions[0];
      if (!question) throw new Error('no question returned');
      const reading = qResp.behaviorReading;
      panel.status('');
      panel.showReading(reading);
      panel.showStatus(qResp.userStatus, qResp.reasoning);
      if (reading?.length) log(`🔎 reading: ${reading.map((r) => `${r.sentiment[0].toUpperCase()}:${r.behavior}`).join(' | ')}`, '#a855f7');
      if (qResp.userStatus) log(`💭 status: ${qResp.userStatus}`, '#a855f7');
      if (qResp.reasoning) log(`   reasoning: ${qResp.reasoning}`, '#6b7280');

      // Speculatively score BOTH options in parallel WHILE the user reads the
      // question, so the reorder after they answer is near-instant.
      const items: Sample[] = cards.map((c) => ({ id: c.id, title: c.title }));
      const spec = new Map<string, Promise<Response>>();
      for (const opt of question.options) {
        const specQuestions = [...turns.map((t) => t.question), question];
        const specAnswers = [...turns.map((t) => t.answer), { questionId: question.id, optionId: opt.id }];
        spec.set(
          opt.id,
          send({ kind: 'score', siteId: site.id, questions: specQuestions, answers: specAnswers, items, behavior, behaviorReading: reading }).catch(
            (e) => ({ ok: false, error: String((e as Error).message ?? e) }) as Response,
          ),
        );
      }

      const answer = await panel.askQuestion(question);
      turns.push({ question, answer });
      const chosenLabel = question.options.find((o) => o.id === answer.optionId)?.label ?? '?';
      log(`Q: "${question.text}" → "${chosenLabel}"`, '#3b82f6');

      // Persist this answer as a durable preference signal + timeline event.
      await recordAnswer(site.id, question.text, chosenLabel);
      await logEvent(site.id, 'answer', `回答：“${question.text}” → ${chosenLabel}`, Date.now());
      void learnPreference(chosenLabel, 0.8); // an explicit answer is a strong preference
      await refreshMemoryBadge();

      panel.status('Scoring…');
      // The speculative call for the chosen option is usually already done → instant.
      const sStart = Date.now();
      let sResp = await spec.get(answer.optionId);
      // Speculative miss/failure → score live so a reorder always happens.
      if (!sResp || !sResp.ok || !('scores' in sResp)) {
        log('speculative miss → scoring live', '#f59e0b');
        sResp = await send({
          kind: 'score',
          siteId: site.id,
          questions: turns.map((t) => t.question),
          answers: turns.map((t) => t.answer),
          items,
          behavior,
          behaviorReading: reading,
        });
      }
      const scoreMs = Date.now() - sStart;
      if (!sResp.ok || !('scores' in sResp)) throw new Error(sResp.ok ? 'bad response' : sResp.error);
      const totalMs = questionMs + scoreMs;
      const timing = { questionMs, scoreMs, totalMs };
      (window as unknown as Record<string, unknown>).__jitLastTiming = timing;
      // Also expose on the DOM host so main-world tooling (Playwright) can read it.
      document.getElementById('__jit_rerank_host__')?.setAttribute('data-jit-timing', JSON.stringify(timing));
      log(`⏱ question ${questionMs}ms · score ${scoreMs}ms · total ${totalMs}ms`, '#f59e0b');

      // Re-grab current DOM card elements — the grid may have re-rendered while the
      // user was reading/answering, leaving our captured `cards` detached. Scores are
      // keyed by stable id (href), so they still map onto the fresh elements.
      const fresh = collectCards(document, site);
      if (fresh.cards.length >= 4) cards = fresh.cards;
      if (snaps.length === 0) snaps = snapshot(cards);
      const { moved, changed } = reorder(cards, sResp.scores);
      await applyHideSeen(); // keep already-seen items hidden after an LLM re-rank
      const secs = (totalMs / 1000).toFixed(1);
      if (moved === 0) {
        panel.status('Detected videos but could not move them — check console.', 'error');
      } else if (changed === 0) {
        panel.status(`Scored ${moved}, but order was already optimal · ${secs}s`);
      } else {
        panel.status(`Re-ranked ${moved} videos · ${secs}s`);
      }
      panel.showRationale(sResp.rationale);
      if (sResp.rationale) log(`↕ rationale: ${sResp.rationale}`, '#a855f7');

      // Expandable list of what got reranked, in the new order.
      const scores = sResp.scores;
      const ranked = cards
        .map((c) => ({ title: c.title, score: scores[c.id] ?? 0 }))
        .sort((a, b) => b.score - a.score);
      panel.showRanked(ranked);

      panel.setPostRerank();
      log(`reorder: moved=${moved}, containers changed=${changed}`, '#10b981');
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      // A missing/invalid API key (or quota) shouldn't be a dead end — these sites
      // re-rank on-device. Fall back to the local embedding re-rank if we can.
      const keyIssue = /api.?key|x-api-key|401|invalid.*key|authentication|credit|quota|overloaded/i.test(msg);
      if (keyIssue) {
        log(`LLM unavailable (${msg}) — trying on-device fallback`, '#f59e0b');
        const did = await silentRerank('llm-fallback');
        if (!did) {
          panel.status(
            'Cloud LLM unavailable (API key). Turn on Dev mode in options for the offline mock — the on-device re-rank also kicks in once it learns your taste.',
            'error',
          );
        }
      } else {
        panel.status(msg, 'error');
      }
      warn(`rerank failed: ${msg}`);
    } finally {
      interacting = false;
    }
  };

  // Detect cards silently once they mount (poll for lazy/SPA grids). We do NOT
  // auto-open on load — the agent stays a quiet pill. Interruption is governed by
  // the monitor (when you seem stuck) or by you clicking the pill.
  let tries = 0;
  const kick = () => {
    tries++;
    const res = collectCards(document, site);
    if (res.cards.length >= 4) {
      detect();
      // Proactive mode: ask as soon as the grid is ready (opt-in).
      if (proactive && !interacting && turns.length === 0 && !site.videoPage(location.href)) {
        void runRound();
      }
      return;
    }
    if (tries < 12) after(kick, 700);
  };
  after(kick, 600);

  // ---- SPA navigation detection ----
  // iyf.tv (and similar SPA sites) change the route via history.pushState WITHOUT a page reload, so
  // the content script keeps running. Poll the URL (+ popstate) to notice route
  // changes, then re-classify the page: credit the video we left, record the new
  // open, reset the per-page conversation, and re-detect the listing grid.
  const onNavigate = (): void => {
    if (location.href === lastUrl) return;
    creditWatch(); // flush watch time for the page we're leaving
    const leftVideo = currentVideo;
    if (leftVideo) void logWatch(leftVideo); // record how long they watched it
    const from = lastUrl;
    lastUrl = location.href;
    log(`nav: ${from} → ${location.href}`, '#6b7280');

    // per-page conversation is stale now
    turns.length = 0;
    snaps = [];
    interacting = false;
    panel.resetForNav();
    interactions.noteUrl(location.href); // filters/sort/search ride the URL

    currentVideo = site.videoPage(location.href);
    watchAnchor = Date.now();
    if (currentVideo) {
      interactions.resetVideo();
      interactions.watchForVideo();
      recordCurrentOpen();
    } else {
      // Returned to a listing → classify how the last video went, re-detect, then
      // let the Monitor decide if THIS context change is a moment to interrupt
      // (e.g. you bounced off a few videos and are back scanning — a good moment).
      void (async () => {
        await monitor.reconcileReturn(Date.now());
        cards = [];
        tries = 0;
        kick();
        after(() => void tryInterrupt('returned-to-listing'), 1400);
      })();
    }
  };
  on(window, 'popstate', onNavigate);
  every(onNavigate, NAV_POLL_MS);

  // Dev/test bridge: lets main-world tooling (Playwright) exercise the isolated-world
  // pipeline via a shared DOM event, writing results to the host element's dataset.
  on(window, 'jit:test', (ev: Event) => {
    const detail = (ev as CustomEvent).detail as {
      cmd: string;
      texts?: string[];
      text?: string;
      n?: number;
      on?: boolean;
      idx?: number;
    };
    void (async () => {
      let result: unknown = null;
      try {
        if (detail.cmd === 'embed') result = { dims: (await embedTexts(detail.texts ?? []))[0]?.length };
        else if (detail.cmd === 'seedPref') {
          const [v] = await embedTexts([detail.text ?? '']);
          for (let i = 0; i < 3; i++) await updatePreference(sid, v, 1);
          result = { seeded: true, confident: isConfident(await getPreference(sid)) };
        } else if (detail.cmd === 'silent') {
          const changed = await silentRerank('test');
          result = { changed };
        } else if (detail.cmd === 'markSeen') {
          // Record opens for the first N detected cards (to exercise "hide seen").
          detect();
          const n = Math.min(detail.n ?? 2, cards.length);
          for (let i = 0; i < n; i++) await recordOpen(sid, cards[i].id, cards[i].title);
          result = { marked: n, ids: cards.slice(0, n).map((c) => c.id) };
        } else if (detail.cmd === 'hideSeen') {
          hideSeen = detail.on ?? true;
          detect();
          const hidden = await applyHideSeen();
          result = { hideSeen, hidden };
        } else if (detail.cmd === 'moreLike') {
          detect();
          const seed = cards[detail.idx ?? 0];
          if (!seed) result = { error: 'no card at index' };
          else {
            await moreLikeThis(seed);
            result = { seed: seed.title, top: cards.slice(0, 5).map((c) => c.title) };
          }
        }
      } catch (e) {
        result = { error: String((e as Error)?.message ?? e) };
      }
      document.getElementById('__jit_rerank_host__')?.setAttribute('data-jit-test', JSON.stringify(result));
    })();
  });

  // Load settings + monitor state; reconcile how the last opened video went.
  void (async () => {
    const s = await getSettings();
    autoSuggest = s.autoSuggest;
    proactive = s.proactive;
    hideSeen = s.hideSeen;
    panel.setAuto(autoSuggest);
    panel.setProactive(proactive);
    panel.setHideSeen(hideSeen);
    weights = await loadWeights(site.id); // the online "when-to-interact" model
    await monitor.load(Date.now());
    await monitor.reconcileReturn(Date.now());
    // If proactive is on and cards are already detected, ask right away.
    if (proactive && !interacting && turns.length === 0 && !site.videoPage(location.href) && cards.length >= 4) {
      void runRound();
    }
  })();
}
