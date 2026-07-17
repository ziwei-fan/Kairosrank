// Measures on-device embedding re-rank latency for 30 items, warm (WASM MiniLM q8 + cosine).
// Injects a 30-item iyf-shaped grid, seeds a confident profile, runs the `silent` bridge cmd
// 4x (1 cold warm-up + 3 timed), and reads the flow.ts-logged "...ms" (embed + cosine + reorder).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(__dirname, '..', 'dist', 'chrome-mv3');
const OUT = '/private/tmp/claude-501/-Users-fanziwei-jit-agent-rerank/46517481-0b6f-46cd-8937-a1e44e5b489a/scratchpad';
const N = 30;

async function cmd(page, detail) {
  await page.evaluate((d) => {
    document.getElementById('__jit_rerank_host__')?.removeAttribute('data-jit-test');
    window.dispatchEvent(new CustomEvent('jit:test', { detail: d }));
  }, detail);
  await page.waitForFunction(() => document.getElementById('__jit_rerank_host__')?.getAttribute('data-jit-test'), { timeout: 60000 });
  return page.evaluate(() => JSON.parse(document.getElementById('__jit_rerank_host__').getAttribute('data-jit-test')));
}

function injectGrid(n) {
  const base = [
    ['甜心恋人', '爱情 喜剧'], ['悬案迷踪', '悬疑 罪案'], ['都市恋曲', '都市 爱情'],
    ['重案追凶', '罪案 刑侦'], ['花好月圆', '爱情 家庭'], ['罪途谜案', '犯罪 悬疑'],
    ['古都风云', '古装 历史'], ['星际远征', '科幻 冒险'], ['深夜食堂', '治愈 生活'],
    ['谍影迷城', '谍战 动作'], ['青春纪事', '青春 校园'], ['铁血刑警', '刑侦 动作'],
    ['海上钢琴', '文艺 音乐'], ['末日孤舰', '科幻 灾难'], ['浮生若梦', '文艺 爱情'],
  ];
  const grid = document.createElement('div');
  grid.id = 'jit-fixture';
  grid.className = 'search-results d-flex flex-wrap';
  for (let i = 0; i < n; i++) {
    const [title, genre] = base[i % base.length];
    const t = `${title}${Math.floor(i / base.length) || ''}`;
    const vc = document.createElement('div');
    vc.className = 'v-c';
    const a = document.createElement('a');
    a.setAttribute('href', `/play/x${i}`);
    a.setAttribute('title', t);
    a.textContent = `${t} ${genre}`;
    vc.appendChild(a);
    grid.appendChild(vc);
  }
  document.body.appendChild(grid);
}

const timings = [];
const context = await chromium.launchPersistentContext(`${OUT}/lat-ondevice`, {
  headless: false,
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
await (context.serviceWorkers()[0] || context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null));

const page = await context.newPage();
page.on('console', (m) => {
  const t = m.text();
  const hit = t.match(/silent rerank @ [^:]+: \d+ moved, changed=\d+, (\d+)ms/);
  if (hit) timings.push(Number(hit[1]));
});

await page.goto('https://www.iyf.tv/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await page.waitForFunction(() => document.getElementById('__jit_rerank_host__')?.shadowRoot, { timeout: 15000 });
await page.evaluate(injectGrid, N);

await cmd(page, { cmd: 'seedPref', text: '悬疑 罪案 刑侦 破案 烧脑' });
const dims = await cmd(page, { cmd: 'embed', texts: ['warm up the model'] });
console.log('embedding dims:', JSON.stringify(dims));

// 1 cold warm-up + 4 timed runs (re-seed each so the profile stays confident and reorder re-fires)
for (let i = 0; i < 5; i++) {
  await cmd(page, { cmd: 'silent' });
  await page.waitForTimeout(200);
}

const warm = timings.slice(1); // drop the first (cold model load)
warm.sort((a, b) => a - b);
const median = warm[Math.floor(warm.length / 2)];
console.log(`\nrank ${N} items — on-device (WASM MiniLM q8 + cosine + reorder)`);
console.log('all runs (ms):', JSON.stringify(timings));
console.log('warm runs (ms):', JSON.stringify(warm));
console.log(`WARM MEDIAN: ${median}ms  (min ${warm[0]}ms, max ${warm[warm.length - 1]}ms)`);

await context.close();
