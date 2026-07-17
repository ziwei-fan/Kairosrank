import type { SiteConfig } from './types';
import { siblingRun } from './types';

// arXiv listing pages (e.g. /list/cs.LG/recent) — server-rendered HTML, verified 2026-07.
// One paper is a <dt> (arXiv id + abs/pdf links) immediately followed by its <dd>
// (title, authors, subjects), both direct children of <dl id="articles">. The title
// and subjects live in the dd, so the movable visual unit is the dt+dd pair.
// (Multi-day "recent" pages interleave <h3> date headers between pairs; those aren't
// part of any unit and stay put — cosmetically fine on the common single-day view.)
export const arxiv: SiteConfig = {
  id: 'arxiv',
  label: 'arXiv',
  matches: (host) => /(^|\.)arxiv\.org$/.test(host),

  itemSelectors: ['dl#articles > dt'],

  title(dt) {
    const dd = dt.nextElementSibling;
    const t = dd?.querySelector('.list-title')?.textContent || '';
    return t.replace(/^\s*Title:\s*/, '').replace(/\s+/g, ' ').trim();
  },

  // Subjects like "Machine Learning (cs.LG); Computation and Language (cs.CL)" — strong
  // topical signal for the embedder, far better than the generic text-scrape.
  tags(dt) {
    const dd = dt.nextElementSibling;
    const s = dd?.querySelector('.list-subjects')?.textContent || '';
    return s.replace(/^\s*Subjects:\s*/, '').replace(/\s+/g, ' ').trim();
  },

  // Stable id = the arXiv id (e.g. "2607.08754"), from the abstract anchor in the dt.
  cardId(dt) {
    const href = dt.querySelector('a[href^="/abs/"]')?.getAttribute('href') || '';
    return href.replace(/^\/abs\//, '').trim();
  },

  // The dt plus its dd (stop at the next dt or a date <h3> header).
  unit: (dt) => siblingRun(dt, 'dt, h3'),

  // An opened paper is /abs/{id}.
  videoPage(url) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/^\/abs\/(.+?)\/?$/);
      if (!m) return null;
      const title = (document.title || '')
        .replace(/^\[?\d{4}\.\d{4,5}(v\d+)?\]?\s*/, '')
        .replace(/\s*[-|].*$/, '')
        .trim();
      return { id: m[1], title: title || m[1] };
    } catch {
      return null;
    }
  },
};
