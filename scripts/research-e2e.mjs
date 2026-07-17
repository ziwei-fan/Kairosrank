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

const context = await chromium.launchPersistentContext(`${OUT}/research-profile`, {
  headless: false,
  args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 1200 },
});
await (context.serviceWorkers()[0] || context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null));
const page = await context.newPage();
page.on('console', (m) => { const t = m.text(); if (/detect:|reorder|container #|resolved 0/i.test(t)) console.log('  [page]', t.slice(0, 140)); });

async function testSite(label, url, cardSel, pairCheck, seed) {
  console.log(`\n===== ${label} : ${url} =====`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('  goto:', String(e).slice(0, 80)));
  await page.waitForFunction(() => document.getElementById('__jit_rerank_host__')?.shadowRoot, { timeout: 20000 }).catch(() => console.log('  (no shadow host)'));
  const detected = await page.evaluate((s) => document.querySelectorAll(s).length, cardSel);
  console.log(`  real cards via "${cardSel}": ${detected}`);
  const before = await page.evaluate((s) => [...document.querySelectorAll(s)].map((a) => a.getAttribute('href')).slice(0, 12), seed.orderSel);
  console.log('  seed:', JSON.stringify(await cmd(page, { cmd: 'seedPref', text: seed.text })));
  const res = await cmd(page, { cmd: 'silent' });
  console.log('  silent:', JSON.stringify(res));
  const after = await page.evaluate((s) => [...document.querySelectorAll(s)].map((a) => a.getAttribute('href')).slice(0, 12), seed.orderSel);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  const pairsIntact = await page.evaluate(pairCheck);
  console.log(`  order changed: ${changed ? 'YES ✅' : 'no'}`);
  console.log(`  multi-element units intact after reorder: ${pairsIntact ? 'YES ✅' : 'NO ❌'}`);
  return { detected, changed, pairsIntact };
}

// arXiv: dt+dd pairs must stay contiguous after reorder.
const arxivPairs = () => {
  const dl = document.querySelector('dl#articles');
  if (!dl) return false;
  const kids = [...dl.children];
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].tagName === 'DT' && (!kids[i + 1] || kids[i + 1].tagName !== 'DD')) return false;
  }
  return true;
};
// HN: every athing row is followed by a non-athing subtext row.
const hnPairs = () => {
  const rows = [...document.querySelectorAll('table tr.athing')];
  return rows.length > 0 && rows.every((tr) => tr.nextElementSibling && !tr.nextElementSibling.classList.contains('athing'));
};

const r1 = await testSite('arXiv', 'https://arxiv.org/list/cs.LG/recent', 'dl#articles > dt', arxivPairs, {
  text: 'retrieval augmented generation dense embeddings vector search reranking',
  orderSel: 'dl#articles > dt a[href^="/abs/"]',
});
const r2 = await testSite('Hacker News', 'https://news.ycombinator.com/', 'tr.athing', hnPairs, {
  text: 'programming languages compilers systems rust kernel',
  orderSel: 'tr.athing .titleline > a', // <tr> has no href — read the title link so order changes are measurable
}).catch((e) => { console.log('  HN err:', String(e).slice(0, 120)); return {}; });

console.log('\n===== SUMMARY =====');
console.log('arXiv   detected>4:', r1.detected > 4, '| reordered:', r1.changed, '| units intact:', r1.pairsIntact);
console.log('HN      detected>4:', r2.detected > 4, '| reordered:', r2.changed, '| units intact:', r2.pairsIntact);
await context.close();
