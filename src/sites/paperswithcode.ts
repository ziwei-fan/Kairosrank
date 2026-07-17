import type { SiteConfig } from './types';

// paperswithcode.co — a client-rendered revival of Papers with Code (the original
// paperswithcode.COM was discontinued and now redirects away; this .CO successor is
// live). Verified via headless render 2026-07: the homepage/listings render
// `article.paper-card` inside `div.paper-list`, each linking to /paper/{id}, and —
// unusually rich for a listing — each card carries the full `.paper-abstract`, which
// makes for excellent topic embeddings. Single-element cards, so no multi-element unit.
export const paperswithcode: SiteConfig = {
  id: 'paperswithcode',
  label: 'paperswithcode.co',
  // .co only — must NOT match the dead .com (\.co$ excludes \.com).
  matches: (host) => /(^|\.)paperswithcode\.co$/.test(host),

  itemSelectors: ['article.paper-card', 'div.paper-list > article', 'a[href^="/paper/"]'],

  title(el) {
    const t =
      el.querySelector('h3.paper-title')?.textContent ||
      el.querySelector('.paper-title')?.textContent ||
      el.querySelector('a[href^="/paper/"]')?.textContent ||
      '';
    return t.replace(/\s+/g, ' ').trim();
  },

  // Richest signal available on any of our listings: the abstract, plus any linked
  // task/method/benchmark/dataset tags. Capped so the embed string stays reasonable.
  tags(el) {
    const linked = Array.from(
      el.querySelectorAll('a[href^="/task"], a[href^="/method"], a[href^="/benchmark"], a[href^="/dataset"]'),
    )
      .map((a) => a.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    const abstract = el.querySelector('.paper-abstract')?.textContent || '';
    return `${linked} ${abstract}`.replace(/\s+/g, ' ').trim().slice(0, 400);
  },

  cardId(el) {
    const a = el.matches('a[href^="/paper/"]') ? el : el.querySelector('a[href^="/paper/"]');
    return a?.getAttribute('href') || '';
  },

  // Opened item = a paper detail page /paper/{id}.
  videoPage(url) {
    try {
      const u = new URL(url);
      const seg = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      if (seg[0] === 'paper' && seg[1]) {
        const title = (document.title || '').replace(/\s*[|·].*$/, '').trim();
        return { id: u.pathname, title: title || u.pathname };
      }
      return null;
    } catch {
      return null;
    }
  },
};
