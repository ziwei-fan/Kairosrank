// Measures Cloud LLM (Claude Haiku 4.5) score/permute latency + cost for 30 items in one call.
// Replicates the extension's real SCORE request (src/llm/anthropic.ts: same endpoint, headers,
// system prompt w/ ephemeral cache, forced tool_choice, max_tokens=4096). Reads usage → $ cost.
// NEVER prints the raw key — only a masked fingerprint.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_FILE = resolve(__dirname, '..', '.anthropic-key');
const MODEL = process.env.JIT_MODEL || 'claude-haiku-4-5';
const RUNS = Number(process.env.RUNS || 3);
// Haiku 4.5 pricing (claude-api skill, per 1M tokens)
const IN_PER_M = 1.0, OUT_PER_M = 5.0, CACHE_WRITE_PER_M = 1.25, CACHE_READ_PER_M = 0.1;

const key = (process.env.ANTHROPIC_API_KEY || (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8') : '')).trim();
if (!key) { console.error('no key'); process.exit(1); }
console.log(`key: ${key.slice(0, 7)}...${key.slice(-4)} (len ${key.length})  model: ${MODEL}\n`);

// --- verbatim from src/llm/prompts.ts ---
const SCORE_SYSTEM_PROMPT = `You are a re-ranking agent for a browser extension.

Given the user's answers, their behavioral signals (time of day, current selection, hovers, opened/watched history, past answers), and a list of videos, score each item 0 (worst match) to 1 (best match) for how well it fits what this user wants RIGHT NOW.

Rules:
- The user's explicit answer to the latest question is the strongest signal. If a "behavior reading" is provided (your own earlier positive/neutral/negative classification of their actions), stay CONSISTENT with it: rank items resembling positive behaviors higher and items resembling negative behaviors lower. Otherwise interpret the raw timeline yourself.
- Later turns are more refined than earlier ones.
- Spread scores across the FULL 0-1 range — decisive separation, not everything near 0.5.
- Also return "rationale": one sentence (简体中文) explaining the ranking logic you applied.
- Return one entry per item via submit_scores. The id is just the item NUMBER as a string ("1", "2", ..., "N") — no title.`;

const SCORE_TOOL = {
  name: 'submit_scores',
  description: 'Submit a 0-1 score for each item plus a one-line rationale.',
  input_schema: {
    type: 'object',
    properties: {
      rationale: { type: 'string', description: 'One sentence in 简体中文 explaining the ranking logic applied.' },
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The item NUMBER, as a string ("1", "2", ...).' },
            score: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['id', 'score'],
        },
      },
    },
    required: ['rationale', 'scores'],
  },
};

const base = [
  ['甜心恋人', '爱情 喜剧'], ['悬案迷踪', '悬疑 罪案'], ['都市恋曲', '都市 爱情'],
  ['重案追凶', '罪案 刑侦'], ['花好月圆', '爱情 家庭'], ['罪途谜案', '犯罪 悬疑'],
  ['古都风云', '古装 历史'], ['星际远征', '科幻 冒险'], ['深夜食堂', '治愈 生活'],
  ['谍影迷城', '谍战 动作'], ['青春纪事', '青春 校园'], ['铁血刑警', '刑侦 动作'],
  ['海上钢琴', '文艺 音乐'], ['末日孤舰', '科幻 灾难'], ['浮生若梦', '文艺 爱情'],
];
const items = Array.from({ length: 30 }, (_, i) => {
  const [t, g] = base[i % base.length];
  return `${i + 1}. ${t}${Math.floor(i / base.length) || ''}`;
});
// buildScoreMessage-shaped user message (notes + behavior + QA + numbered items)
const userMessage =
  `=== USER NOTES: (none — empty) ===\n\n` +
  `The user's recent interaction timeline:\n  搜索：“悬疑 罪案”\n  停留在：重案追凶（8秒）\n  打开视频：罪途谜案\n\n` +
  `User answers:\nQ: 想看烧脑罪案，还是轻松爱情？\nA: 烧脑罪案\n\n` +
  `Items to score (numbered 1-30). For each item, return its NUMBER (as a string, e.g. "1", "2", ...) and a score 0-1.\n\n` +
  items.join('\n');

async function once() {
  const body = {
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: SCORE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [SCORE_TOOL],
    tool_choice: { type: 'tool', name: SCORE_TOOL.name },
    messages: [{ role: 'user', content: userMessage }],
  };
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`API error: ${json.error?.message ?? res.status}`);
  const u = json.usage || {};
  const inTok = u.input_tokens || 0, outTok = u.output_tokens || 0;
  const cWrite = u.cache_creation_input_tokens || 0, cRead = u.cache_read_input_tokens || 0;
  const cost =
    (inTok * IN_PER_M + outTok * OUT_PER_M + cWrite * CACHE_WRITE_PER_M + cRead * CACHE_READ_PER_M) / 1e6;
  const nScores = (json.content.find((b) => b.type === 'tool_use')?.input?.scores || []).length;
  return { ms, inTok, outTok, cWrite, cRead, cost, nScores };
}

const runs = [];
for (let i = 0; i < RUNS; i++) {
  const r = await once();
  runs.push(r);
  console.log(
    `run ${i + 1}: ${r.ms}ms  in=${r.inTok} out=${r.outTok} cacheW=${r.cWrite} cacheR=${r.cRead}  ` +
      `scores=${r.nScores}  $${r.cost.toFixed(6)}`,
  );
}
const lat = runs.map((r) => r.ms).sort((a, b) => a - b);
const median = lat[Math.floor(lat.length / 2)];
const avgCost = runs.reduce((a, r) => a + r.cost, 0) / runs.length;
console.log(`\nrank 30 items — Cloud Haiku 4.5 (single score call, forced tool_use)`);
console.log(`latency median: ${median}ms  (min ${lat[0]}, max ${lat[lat.length - 1]})`);
console.log(`avg cost/call: $${avgCost.toFixed(6)}  (~$${(avgCost * 1000).toFixed(2)} per 1000 re-ranks)`);
