import { describe, it, expect, beforeEach } from 'vitest';
import { collectCards } from './types';
import { reorder } from '../rerank/reorder';
import { arxiv } from './arxiv';
import { hackernews } from './hackernews';

beforeEach(() => {
  document.body.innerHTML = '';
});

// ---- arXiv (dl#articles > dt, metadata in the following dd) --------------------
function buildArxiv(items: { id: string; title: string; subjects: string }[]): void {
  const dl = document.createElement('dl');
  dl.id = 'articles';
  const h3 = document.createElement('h3');
  h3.textContent = 'Fri, 11 Jul 2026';
  dl.appendChild(h3); // a date separator interleaved among the pairs
  for (const it of items) {
    const dt = document.createElement('dt');
    const a = document.createElement('a');
    a.setAttribute('href', `/abs/${it.id}`);
    a.setAttribute('title', 'Abstract');
    a.id = it.id;
    a.textContent = `arXiv:${it.id}`;
    dt.appendChild(a);

    const dd = document.createElement('dd');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const lt = document.createElement('div');
    lt.className = 'list-title mathjax';
    const d1 = document.createElement('span');
    d1.className = 'descriptor';
    d1.textContent = 'Title:';
    lt.append(d1, document.createTextNode(' ' + it.title));
    const ls = document.createElement('div');
    ls.className = 'list-subjects';
    const d2 = document.createElement('span');
    d2.className = 'descriptor';
    d2.textContent = 'Subjects:';
    const ps = document.createElement('span');
    ps.className = 'primary-subject';
    ps.textContent = ' ' + it.subjects;
    ls.append(d2, ps);
    meta.append(lt, ls);
    dd.appendChild(meta);

    dl.append(dt, dd);
  }
  document.body.appendChild(dl);
}

describe('arxiv adapter', () => {
  const items = [
    { id: '2607.08754', title: 'SLORR: Simple and Efficient In-Training Low-Rank Regularization', subjects: 'Machine Learning (cs.LG)' },
    { id: '2607.08755', title: 'Super Weights in LLMs and the Failure of Selective Training', subjects: 'Computation and Language (cs.CL); Machine Learning (cs.LG)' },
    { id: '2607.08756', title: 'Latent Memory Palace: Reasoning for Control', subjects: 'Machine Learning (cs.LG)' },
    { id: '2607.08757', title: 'UniClawBench: A Universal Benchmark for Proactive Agents', subjects: 'Artificial Intelligence (cs.AI)' },
    { id: '2607.08758', title: 'Dimensionality Reduction Meets Network Science', subjects: 'Machine Learning (cs.LG)' },
  ];

  it('collects clean titles, subject tags, ids, and dt+dd units', () => {
    buildArxiv(items);
    const { cards, usedSelector } = collectCards(document, arxiv);
    expect(usedSelector).toBe('dl#articles > dt');
    expect(cards.length).toBe(5);
    expect(cards[0].title).toBe('SLORR: Simple and Efficient In-Training Low-Rank Regularization');
    expect(cards[0].id).toBe('2607.08754');
    expect(cards[0].tags).toContain('cs.LG');
    expect(cards[1].tags).toContain('cs.CL');
    // Movable unit is the dt + its dd.
    expect(cards[0].unit?.map((e) => e.tagName)).toEqual(['DT', 'DD']);
  });

  it('detects an opened paper page (/abs/{id}) and ignores the listing', () => {
    expect(arxiv.videoPage('https://arxiv.org/abs/2607.08754')?.id).toBe('2607.08754');
    expect(arxiv.videoPage('https://arxiv.org/abs/2607.08754v2')?.id).toBe('2607.08754v2');
    expect(arxiv.videoPage('https://arxiv.org/list/cs.LG/recent')).toBeNull();
  });

  it('reorders dt+dd pairs together end-to-end', () => {
    buildArxiv(items);
    const { cards } = collectCards(document, arxiv);
    // Favor the last paper.
    const scores = Object.fromEntries(cards.map((c, i) => [c.id, i === 4 ? 1 : 0.1 * i]));
    const { moved } = reorder(cards, scores);
    expect(moved).toBe(5);
    const dl = document.getElementById('articles')!;
    const firstTwo = Array.from(dl.children)
      .filter((c) => c.tagName === 'DT' || c.tagName === 'DD')
      .slice(0, 2)
      .map((c) => c.tagName);
    expect(firstTwo).toEqual(['DT', 'DD']); // top unit is still a coherent dt+dd
    const topId = dl.querySelector('dt a[href^="/abs/"]')?.getAttribute('href');
    expect(topId).toBe('/abs/2607.08758'); // highest score floated to the top
  });
});

// ---- Hacker News (tr.athing + subtext + spacer) --------------------------------
function buildHN(items: { id: string; title: string; site?: string }[]): void {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  for (const it of items) {
    const athing = document.createElement('tr');
    athing.className = 'athing';
    athing.id = it.id;
    const td = document.createElement('td');
    const line = document.createElement('span');
    line.className = 'titleline';
    const a = document.createElement('a');
    a.setAttribute('href', 'https://example.com/article');
    a.textContent = it.title;
    line.appendChild(a);
    if (it.site) {
      const s = document.createElement('span');
      s.className = 'sitestr';
      s.textContent = it.site;
      line.append(document.createTextNode(' ('), s, document.createTextNode(')'));
    }
    td.appendChild(line);
    athing.appendChild(td);

    const subtext = document.createElement('tr');
    const std = document.createElement('td');
    std.className = 'subtext';
    std.textContent = '120 points';
    subtext.appendChild(std);

    const spacer = document.createElement('tr');
    spacer.className = 'spacer';

    tbody.append(athing, subtext, spacer);
  }
  table.appendChild(tbody);
  document.body.appendChild(table);
}

describe('hackernews adapter', () => {
  const items = [
    { id: '111', title: 'Show HN: A tiny on-device reranker', site: 'github.com' },
    { id: '222', title: 'The physics of coffee extraction', site: 'example.org' },
    { id: '333', title: 'Ask HN: How do you test browser extensions?' },
    { id: '444', title: 'Rust in the Linux kernel, one year in', site: 'lwn.net' },
    { id: '555', title: 'A new approach to vector search', site: 'arxiv.org' },
  ];

  it('collects titles, ids, tags, and 3-row units', () => {
    buildHN(items);
    const { cards, usedSelector } = collectCards(document, hackernews);
    expect(usedSelector).toBe('tr.athing');
    expect(cards.length).toBe(5);
    expect(cards[0].title).toBe('Show HN: A tiny on-device reranker');
    expect(cards[0].id).toBe('111');
    expect(cards[0].tags).toContain('github.com');
    expect(cards[0].tags).toContain('Show HN');
    // athing + subtext + spacer.
    expect(cards[0].unit?.length).toBe(3);
  });

  it('detects an opened comments page (/item?id=) and ignores the front page', () => {
    expect(hackernews.videoPage('https://news.ycombinator.com/item?id=333')?.id).toBe('333');
    expect(hackernews.videoPage('https://news.ycombinator.com/')).toBeNull();
  });

  it('reorders 3-row stories together end-to-end', () => {
    buildHN(items);
    const { cards } = collectCards(document, hackernews);
    const scores = Object.fromEntries(cards.map((c) => [c.id, c.id === '555' ? 1 : 0.1]));
    reorder(cards, scores);
    const rows = Array.from(document.querySelector('tbody')!.children) as HTMLElement[];
    // First three rows are story 555's coherent run.
    expect(rows[0].className).toContain('athing');
    expect(rows[0].id).toBe('555');
    expect(rows[1].querySelector('.subtext')).toBeTruthy();
    expect(rows[2].className).toContain('spacer');
  });
});
