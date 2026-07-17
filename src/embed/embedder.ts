// Local text embedding via Transformers.js, running in an MV3 offscreen document.
// Model + ONNX-runtime WASM are BUNDLED as extension resources (MV3 forbids remote
// code); nothing is fetched from the network.
//
// Model: paraphrase-multilingual-MiniLM-L12-v2 (384-dim, 50+ languages). Chosen
// over a Chinese-only model so ranking works across zh + en content (video sites
// AND research/ML sites). It's a symmetric-similarity model — embed text directly,
// no query:/passage: prefix — which fits our preference-centroid cosine ranking.
// Validated cross-lingual: zh-crime↔en-crime 0.54 vs zh-crime↔en-romance 0.11.

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

let configured = false;
function configure(): void {
  if (configured) return;
  env.allowRemoteModels = false; // never hit the network — everything is bundled
  env.allowLocalModels = true;
  env.localModelPath = chrome.runtime.getURL('models/');
  const wasm = env.backends.onnx.wasm as { wasmPaths?: string; numThreads?: number };
  wasm.wasmPaths = chrome.runtime.getURL('ort/');
  wasm.numThreads = 1; // no cross-origin isolation in the SW → single-threaded WASM
  configured = true;
}

let pipePromise: Promise<FeatureExtractionPipeline> | null = null;
function getPipe(): Promise<FeatureExtractionPipeline> {
  configure();
  if (!pipePromise) {
    pipePromise = pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' }) as Promise<FeatureExtractionPipeline>;
  }
  return pipePromise;
}

// Embed texts → L2-normalized vectors (so dot product == cosine similarity).
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extract = await getPipe();
  const out = await extract(texts, { pooling: 'mean', normalize: true });
  return out.tolist() as number[][];
}
