import type { SiteConfig } from './types';

// iyf.tv — verified against the live DOM (2026-04):
//   grid pages: container div.search-results, card = div.v-c, link a[href*="/play/"] with title attr
//   homepage carousels: card = div.banner-box (swiper — may not reorder visually)
export const iyf: SiteConfig = {
  id: 'iyf',
  label: 'iyf.tv',
  matches: (host) => /(^|\.)iyf\.(tv|com)$/.test(host),

  // Prefer the real card wrapper (div.v-c) over the nested <a>.
  itemSelectors: ['div.v-c', 'div.banner-box', 'a[href*="/play/"]'],

  title(card) {
    const t =
      card.querySelector('a[title]')?.getAttribute('title') ||
      card.querySelector('.banner-cover-title, .title, [class*="title" i]')?.textContent ||
      card.querySelector('img')?.getAttribute('alt') ||
      card.getAttribute('title') ||
      card.textContent ||
      '';
    return t.slice(0, 200);
  },

  cardId(card) {
    const a = card.matches('a[href*="/play/"]')
      ? card
      : card.querySelector('a[href*="/play/"]');
    return a?.getAttribute('href') || '';
  },

  videoPage(url) {
    try {
      const u = new URL(url);
      if (!/\/play\//.test(u.pathname)) return null;
      const title = (document.title || '').replace(/\s*[-|_].*$/, '').trim();
      return { id: u.pathname, title: title || u.pathname };
    } catch {
      return null;
    }
  },
};
