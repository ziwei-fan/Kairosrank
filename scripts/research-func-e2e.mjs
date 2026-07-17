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
  await page.waitForFunction(() => document.getElementById('__jit_rerank_host__')?.getAttribute('data-jit-test'), { timeout: 90000 });
  return page.evaluate(() => JSON.parse(document.getElementById('__jit_rerank_host__').getAttribute('data-jit-test')));
}
const visibleDts = () =>
  [...document.querySelectorAll('dl#articles > dt')].filter((dt) => getComputedStyle(dt).display !== 'none').length;
const hiddenMarks = () => document.querySelectorAll('#articles [data-jit-hidden]').length;
const firstTitle = () => {
  const dd = document.querySelector('dl#articles > dt')?.nextElementSibling;
  return (dd?.querySelector('.list-title')?.textContent || '').replace(/^\s*Title:\s*/, '').replace(/\s+/g, ' ').trim();
};

const context = await chromium.launchPersistentContext(`${OUT}/func-profile`, {
  headless: false,
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 1200 },
});
await (context.serviceWorkers()[0] || context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null));
const page = await context.newPage();

await page.goto('https://arxiv.org/list/cs.LG/recent', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => document.getElementById('__jit_rerank_host__')?.shadowRoot, { timeout: 20000 });
const total = await page.evaluate(() => document.querySelectorAll('dl#articles > dt').length);
console.log(`arXiv papers on page: ${total}`);

console.log('\n--- Feature 1: demote already-seen ---');
const marked = await cmd(page, { cmd: 'markSeen', n: 2 });
console.log('marked seen:', JSON.stringify(marked));
const on = await cmd(page, { cmd: 'hideSeen', on: true });
const visAfterHide = await page.evaluate(visibleDts);
const marksAfterHide = await page.evaluate(hiddenMarks);
console.log(`hideSeen on → ${JSON.stringify(on)} | visible dts: ${visAfterHide}/${total} | hidden markers: ${marksAfterHide}`);
const off = await cmd(page, { cmd: 'hideSeen', on: false });
const visAfterShow = await page.evaluate(visibleDts);
const marksAfterShow = await page.evaluate(hiddenMarks);
console.log(`hideSeen off → ${JSON.stringify(off)} | visible dts: ${visAfterShow}/${total} | hidden markers: ${marksAfterShow}`);

const hideOK = on.hidden === 2 && visAfterHide === total - 2 && marksAfterHide === 4 && visAfterShow === total && marksAfterShow === 0;
console.log(`demote-seen: ${hideOK ? 'PASS ✅' : 'FAIL ❌'}`);

console.log('\n--- Feature 2: more-like-this (⌥-click) ---');
const ml = await cmd(page, { cmd: 'moreLike', idx: 5 });
const domFirst = await page.evaluate(firstTitle);
console.log('seed (clicked):', JSON.stringify(ml.seed));
console.log('first paper in DOM after rerank:', JSON.stringify(domFirst));
const mltOK = !!ml.seed && domFirst === ml.seed;
console.log(`more-like-this ranks the clicked item #1: ${mltOK ? 'PASS ✅' : 'FAIL ❌'}`);

console.log('\n===== SUMMARY =====');
console.log('demote already-seen:', hideOK ? '✅' : '❌');
console.log('on-page more-like-this:', mltOK ? '✅' : '❌');
await context.close();
