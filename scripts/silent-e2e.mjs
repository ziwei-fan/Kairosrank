import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(__dirname, '..', 'dist', 'chrome-mv3');
const OUT = '/private/tmp/claude-501/-Users-fanziwei-jit-agent-rerank/1444921c-526a-4c67-a896-deb13a2ad5f8/scratchpad';

async function cmd(page, detail) {
  await page.evaluate((d) => {
    document.getElementById('__jit_rerank_host__')?.removeAttribute('data-jit-test');
    window.dispatchEvent(new CustomEvent('jit:test', { detail: d }));
  }, detail);
  await page.waitForFunction(() => document.getElementById('__jit_rerank_host__')?.getAttribute('data-jit-test'), { timeout: 60000 });
  return page.evaluate(() => JSON.parse(document.getElementById('__jit_rerank_host__').getAttribute('data-jit-test')));
}

// A synthetic iyf-shaped grid (div.search-results > div.v-c > a[title][href*=/play/] + genre text),
// so we can test the on-device reorder without depending on the live (Cloudflare-gated) site.
function injectGrid() {
  const grid = document.createElement('div');
  grid.id = 'jit-fixture';
  grid.className = 'search-results d-flex flex-wrap';
  const cards = [
    ['/play/r1', '甜心恋人', '爱情 喜剧'],
    ['/play/c1', '悬案迷踪', '悬疑 罪案'],
    ['/play/r2', '都市恋曲', '都市 爱情'],
    ['/play/c2', '重案追凶', '罪案 刑侦'],
    ['/play/r3', '花好月圆', '爱情 家庭'],
    ['/play/c3', '罪途谜案', '犯罪 悬疑'],
    ['/play/o1', '古都风云', '古装 历史'],
    ['/play/o2', '星际远征', '科幻 冒险'],
  ];
  for (const [href, title, genre] of cards) {
    const vc = document.createElement('div');
    vc.className = 'v-c';
    const a = document.createElement('a');
    a.setAttribute('href', href);
    a.setAttribute('title', title);
    a.textContent = `${title} ${genre}`;
    vc.appendChild(a);
    grid.appendChild(vc);
  }
  document.body.appendChild(grid);
}
const order = () => `[...document.querySelectorAll('#jit-fixture .v-c a')].map(a => a.getAttribute('title'))`;

const context = await chromium.launchPersistentContext(`${OUT}/silent-profile`, {
  headless: false,
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
await (context.serviceWorkers()[0] || context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null));

const page = await context.newPage();
// Any iyf URL — the content script injects regardless of what the page renders.
await page.goto('https://www.iyf.tv/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await page.waitForFunction(() => document.getElementById('__jit_rerank_host__')?.shadowRoot, { timeout: 15000 });
await page.evaluate(injectGrid);

console.log('seed a CRIME-leaning profile:', JSON.stringify(await cmd(page, { cmd: 'seedPref', text: '悬疑 罪案 刑侦 破案 烧脑' })));
const before = await page.evaluate(order());
const res = await cmd(page, { cmd: 'silent' });
const after = await page.evaluate(order());

console.log('silent re-rank result:', JSON.stringify(res));
console.log('before:', JSON.stringify(before));
console.log('after: ', JSON.stringify(after));
const crimeFirst = after.slice(0, 3).filter((t) => /案|罪|悬|侦/.test(t)).length;
console.log(`crime titles in top-3 after: ${crimeFirst}/3 ${crimeFirst >= 3 ? '✅' : ''}`);

await context.close();
