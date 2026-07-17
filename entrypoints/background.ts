import { getSettings, activeKey, activeModel, type Settings } from '../src/storage';
import type { Request, Response } from '../src/messages';
import * as anthropic from '../src/llm/anthropic';
import * as openai from '../src/llm/openai';
import { mockQuestions, mockScores } from '../src/llm/mock';
import { cosine } from '../src/embed/vec';

// Pick the adapter for the configured provider (both expose the same interface).
const adapter = (s: Settings) => (s.provider === 'openai' ? openai : anthropic);

// The embedder (WASM + dynamic import) can't run in the SW — route to an offscreen doc.
let creatingOffscreen: Promise<void> | null = null;
async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_SCRAPING' as chrome.offscreen.Reason],
        justification: 'Run a local embedding model on-device for ranking',
      })
      .catch((e) => {
        if (!String(e).includes('single offscreen')) throw e; // race: already created
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  await creatingOffscreen;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  await ensureOffscreen();
  const resp = (await chrome.runtime.sendMessage({ target: 'offscreen', kind: 'embed', texts })) as
    | { ok: true; vectors: number[][] }
    | { ok: false; error: string };
  if (!resp?.ok) throw new Error(resp?.error || 'embed failed');
  return resp.vectors;
}

export default defineBackground(() => {
  console.log('[jit-rerank] background ready');

  // One-time self-test of the local embedder (bundled model + WASM). Persists the
  // result so external tooling can read it reliably.
  void (async () => {
    try {
      const t0 = Date.now();
      const [a, b, c] = await embedTexts(['悬疑 罪案 刑侦', '爱情 甜蜜 喜剧', '悬案 破案 烧脑']);
      const result = {
        ok: true,
        ms: Date.now() - t0,
        dims: a.length,
        cosCrimeRomance: Number(cosine(a, b).toFixed(3)),
        cosCrimeCrime: Number(cosine(a, c).toFixed(3)),
      };
      console.log('[jit-rerank] embed self-test OK', result);
      await chrome.storage.local.set({ __embedSelfTest: result });
    } catch (e) {
      const result = { ok: false, error: String((e as Error)?.message ?? e) };
      console.error('[jit-rerank] embed self-test FAILED:', e);
      await chrome.storage.local.set({ __embedSelfTest: result });
    }
  })();

  chrome.storage.session
    .setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .catch((e) => console.warn('[jit-rerank] could not expose session storage:', e));

  chrome.runtime.onMessage.addListener(
    (req: Request, _sender, sendResponse: (r: Response) => void) => {
      handle(req)
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
      return true;
    },
  );
});

async function handle(req: Request): Promise<Response> {
  const settings = await getSettings();

  if (req.kind === 'embed') {
    return { ok: true, vectors: await embedTexts(req.texts) };
  }

  if (req.kind === 'ping') {
    if (settings.devMode) return { ok: true, pong: true, ready: true, reason: 'dev mode' };
    if (!activeKey(settings)) return { ok: true, pong: true, ready: false, reason: `no ${settings.provider} API key` };
    return { ok: true, pong: true, ready: true };
  }

  if (req.kind === 'questions') {
    const r = settings.devMode
      ? await mockQuestions(req.samples, req.priorTurns ?? [])
      : await adapter(settings).generateQuestions(
          activeKey(settings),
          activeModel(settings),
          req.siteId,
          req.samples,
          req.behavior,
          req.priorTurns,
          req.userNotes,
        );
    return {
      ok: true,
      questions: r.questions,
      userStatus: r.userStatus,
      reasoning: r.reasoning,
      behaviorReading: r.behaviorReading,
    };
  }

  if (req.kind === 'score') {
    const r = settings.devMode
      ? await mockScores(req.questions, req.answers, req.items)
      : await adapter(settings).scoreItems(
          activeKey(settings),
          activeModel(settings),
          req.questions,
          req.answers,
          req.items,
          req.behavior,
          req.userNotes,
          req.behaviorReading,
        );
    return { ok: true, scores: r.scores, rationale: r.rationale };
  }

  throw new Error(`Unknown request: ${(req as { kind: string }).kind}`);
}
