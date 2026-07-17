import type { SiteConfig } from './types';

// Hugging Face listing surfaces — /models, /datasets, /papers. Client-rendered, but the
// cards are real DOM after hydration (verified 2026-07). Models & datasets share the
// `article.overview-card-wrapper` shape; papers use a plainer <article> with an h3 link.
// Each card is a single element, so no multi-element `unit` is needed.

// First path segment values that are HF sections, NOT a {owner}/{model} repo — used to
// avoid misreading an org/section page as an opened model.
const HF_RESERVED = new Set([
  'datasets', 'models', 'spaces', 'papers', 'docs', 'blog', 'settings', 'organizations',
  'collections', 'join', 'login', 'new', 'notifications', 'pricing', 'enterprise', 'chat',
  'posts', 'tasks', 'learn', 'search', 'api', 'discuss', 'changelog', 'terms-of-service',
  'privacy', 'brand', 'welcome', 'models-json', 'metrics',
]);

export const huggingface: SiteConfig = {
  id: 'huggingface',
  label: 'Hugging Face',
  matches: (host) => /(^|\.)huggingface\.co$/.test(host),

  itemSelectors: ['article.overview-card-wrapper', 'article:has(h3 > a[href^="/papers/"])'],

  title(el) {
    const t =
      el.querySelector('header[title]')?.getAttribute('title') ||
      el.querySelector('h3 > a[href^="/papers/"]')?.textContent ||
      el.querySelector('h4')?.textContent ||
      '';
    return t.replace(/\s+/g, ' ').trim();
  },

  // Models: pipeline task + params/downloads/likes; Datasets: modality/size/updated.
  // (Papers cards carry no category — title carries the signal there.)
  tags(el) {
    return (el.querySelector('.text-gray-400')?.textContent || '').replace(/\s+/g, ' ').trim();
  },

  // Stable id = the card's primary href (repo/dataset/paper path).
  cardId(el) {
    const a = el.matches('.overview-card-wrapper')
      ? el.querySelector('a[href^="/datasets/"], a[href]')
      : el.querySelector('h3 > a[href^="/papers/"]');
    return a?.getAttribute('href') || '';
  },

  // Opened item: /papers/{id}, /datasets/{owner}/{name}, or a bare {owner}/{model} repo.
  videoPage(url) {
    try {
      const seg = new URL(url).pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      const title = (document.title || '').replace(/\s*[·|].*$/, '').trim();
      if (seg[0] === 'papers' && seg[1]) return { id: `/papers/${seg[1]}`, title: title || seg[1] };
      if (seg[0] === 'datasets' && seg[1] && seg[2])
        return { id: `/datasets/${seg[1]}/${seg[2]}`, title: title || `${seg[1]}/${seg[2]}` };
      if (seg.length >= 2 && !HF_RESERVED.has(seg[0]))
        return { id: `/${seg[0]}/${seg[1]}`, title: title || `${seg[0]}/${seg[1]}` };
      return null;
    } catch {
      return null;
    }
  },
};
