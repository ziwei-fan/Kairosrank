// Fetches the large bundled assets that are NOT committed to git (see .gitignore):
//   - the on-device embedding model  -> public/models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/
//   - the ONNX Runtime Web WASM       -> public/ort/
// Run once after `npm install`, before `npm run build`.  Idempotent: skips files already present.
import { createWriteStream, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const HF_BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const MODEL_DIR = join(ROOT, 'public', 'models', MODEL_ID);
const MODEL_FILES = [
  'config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'unigram.json',
  'onnx/model_quantized.onnx',
];

const ORT_SRC = join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
const ORT_DIR = join(ROOT, 'public', 'ort');
const ORT_FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.asyncify.mjs',
];

const mb = (p) => (statSync(p).size / 1e6).toFixed(1);

async function download(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) return console.log(`  ✓ ${dest.replace(ROOT + '/', '')} (${mb(dest)} MB, cached)`);
  process.stdout.write(`  ↓ ${dest.replace(ROOT + '/', '')} … `);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`${mb(dest)} MB`);
}

console.log(`\nModel → public/models/${MODEL_ID}/`);
for (const f of MODEL_FILES) await download(`${HF_BASE}/${f}`, join(MODEL_DIR, f));

console.log(`\nONNX Runtime → public/ort/  (from node_modules/onnxruntime-web)`);
if (!existsSync(ORT_SRC)) {
  console.error(`  ✗ ${ORT_SRC} not found — run \`npm install\` first.`);
  process.exit(1);
}
mkdirSync(ORT_DIR, { recursive: true });
for (const f of ORT_FILES) {
  const src = join(ORT_SRC, f), dest = join(ORT_DIR, f);
  if (existsSync(dest)) { console.log(`  ✓ public/ort/${f} (${mb(dest)} MB, cached)`); continue; }
  if (!existsSync(src)) throw new Error(`missing ${src} — onnxruntime-web layout changed?`);
  copyFileSync(src, dest);
  console.log(`  ✓ public/ort/${f} (${mb(dest)} MB)`);
}

console.log('\n✅ Assets ready. Now run `npm run build`.\n');
