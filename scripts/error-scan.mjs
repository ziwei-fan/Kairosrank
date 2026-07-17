import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(__dirname, '..', 'dist', 'chrome-mv3');
const OUT = '/private/tmp/claude-501/-Users-fanziwei-jit-agent-rerank/1444921c-526a-4c67-a896-deb13a2ad5f8/scratchpad';

const IGNORE = /Failed to load resource|net::ERR|favicon|Cloudflare|challenge|ERR_BLOCKED|status of 4|status of 5|preloaded using link preload/i;
const errors = [];

const context = await chromium.launchPersistentContext(`${OUT}/errscan-profile`, {
  headless: false,
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 1000 },
});
const sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null));
if (sw) sw.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('[SW] ' + m.text().slice(0, 200)); });

const page = await context.newPage();
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('[console] ' + m.text().slice(0, 200)); });

async function visit(label, url, waitMs = 4000) {
  console.log(`visiting ${label} …`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('  goto:', String(e).slice(0, 60)));
  await page.waitForFunction(() => document.getElementById('__jit_rerank_host__')?.shadowRoot, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(waitMs);
}

// Listing page (adapter + detect + hover attach), detail page (opened-item path + recordOpen),
// and trigger the offscreen embedder via the bridge (exercises SW <-> offscreen messaging).
await visit('arXiv listing', 'https://arxiv.org/list/cs.LG/recent');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('jit:test', { detail: { cmd: 'embed', texts: ['hello world', '测试'] } })));
await page.waitForTimeout(6000); // let the embedder load (first-time model init)
await visit('arXiv detail page', 'https://arxiv.org/abs/2607.08754', 3000);
await visit('Hacker News', 'https://news.ycombinator.com/', 3000);

// Read the background embed self-test result (stored by background.ts on boot).
const selfTest = await (sw ? sw.evaluate(() => new Promise((r) => chrome.storage.local.get('__embedSelfTest', (o) => r(o.__embedSelfTest))).catch(() => null)).catch(() => null) : null);

console.log('\n===== ERROR SCAN RESULT =====');
console.log('embed self-test (background):', JSON.stringify(selfTest));
if (errors.length === 0) console.log('uncaught errors / console errors: NONE ✅');
else { console.log(`captured ${errors.length} error(s) ❌:`); errors.forEach((e) => console.log('  - ' + e)); }
await context.close();
