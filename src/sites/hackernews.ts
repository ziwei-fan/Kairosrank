import type { SiteConfig } from './types';
import { siblingRun } from './types';

// Hacker News (news.ycombinator.com) — server-rendered HTML, verified 2026-07.
// One story is a <tr class="athing" id="{itemId}"> (title row) followed by an unclassed
// <tr> (subtext: points / author / comments) and a <tr class="spacer">, all siblings in
// the same tbody. The movable visual unit is that run of rows.
export const hackernews: SiteConfig = {
  id: 'hackernews',
  label: 'Hacker News',
  matches: (host) => /(^|\.)ycombinator\.com$/.test(host),

  itemSelectors: ['tr.athing'],

  title(tr) {
    return (tr.querySelector('.titleline > a')?.textContent || '').replace(/\s+/g, ' ').trim();
  },

  // Weak but real: the source domain + Ask/Show/Tell prefix. Titles carry most of the signal.
  tags(tr) {
    const site = tr.querySelector('.titleline .sitestr')?.textContent?.trim() || '';
    const kind = (tr.querySelector('.titleline > a')?.textContent || '').match(/^(Ask|Show|Tell) HN/)?.[0] || '';
    return `${kind} ${site}`.replace(/\s+/g, ' ').trim();
  },

  // Stable id = the item id on the athing row.
  cardId(tr) {
    return tr.getAttribute('id') || '';
  },

  // The title row + its subtext + spacer, up to the next story or the "More" link row.
  unit: (tr) => siblingRun(tr, 'tr.athing, tr.morelink'),

  // The observable "open" is the comments page /item?id={id} (the title link leaves HN
  // to the external article, which the content script can't follow).
  videoPage(url) {
    try {
      const u = new URL(url);
      if (u.pathname !== '/item') return null;
      const id = u.searchParams.get('id');
      if (!id) return null;
      const title = (document.title || '').replace(/\s*\|\s*Hacker News.*$/i, '').trim();
      return { id, title: title || id };
    } catch {
      return null;
    }
  },
};
