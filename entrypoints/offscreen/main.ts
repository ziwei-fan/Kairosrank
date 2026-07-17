// Offscreen document — a real page context (dynamic import() + WASM allowed),
// unlike the service worker. Runs the local embedding model on request.
import { embed } from '../../src/embed/embedder';

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const m = msg as { target?: string; kind?: string; texts?: string[] };
  if (m?.target !== 'offscreen') return; // ignore messages meant for the background
  if (m.kind === 'embed') {
    embed(m.texts ?? [])
      .then((vectors) => sendResponse({ ok: true, vectors }))
      .catch((e) => sendResponse({ ok: false, error: String((e as Error)?.message ?? e) }));
    return true; // async response
  }
  return undefined;
});
