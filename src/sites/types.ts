export interface Card {
  el: HTMLElement;
  id: string;
  title: string;
  tags: string; // genre/category text scraped from the card (drives embedding quality)
  /** When a visual unit spans multiple sibling elements (arXiv dt+dd, HN athing+subtext+spacer),
   *  the full ordered group so reorder moves them together. Undefined = the single `el`. */
  unit?: HTMLElement[];
}

export interface SiteConfig {
  id: string;
  label: string;
  matches(host: string): boolean;
  /** Ordered candidate selectors for the card element; first that yields enough cards wins. */
  itemSelectors: string[];
  /** Extract a human title from one card element. */
  title(card: HTMLElement): string;
  /** Stable id for one card (used to map LLM/embedding scores back). */
  cardId(card: HTMLElement): string;
  /** If the given URL is a single item/detail page, return {id,title}; else null.
   *  (Historically "videoPage"; now serves as the generic opened-item predicate.) */
  videoPage(url: string): { id: string; title: string } | null;
  /** Optional: domain-specific tags (abstract/subjects/task) for better embeddings.
   *  When absent, a generic text-scrape is used. */
  tags?(card: HTMLElement): string;
  /** Optional: the full multi-element visual unit for a card (see Card.unit). */
  unit?(card: HTMLElement): HTMLElement[];
  /** Optional: embedding model override (per-site routing). Absent = the default bundled model. */
  model?: string;
}

const MIN_CARDS = 4;

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

// Generic genre/category text: the card's visible text minus the title and noise
// (episode counts, "更新", VIP badges, bare numbers). Good enough to carry genre signal.
function extractTags(el: HTMLElement, title: string): string {
  let t = clean(el.textContent);
  if (title) t = t.split(title).join(' ');
  return clean(t.replace(/\d+集全|更新\s*\d+|预告|会员|VIP|\d{2,}/g, '')).slice(0, 60);
}

/** [el, ...following sibling elements up to (excluding) the next `stopSelector` match].
 *  Groups a multi-element visual unit (arXiv dt+dd, HN athing+subtext+spacer) so reorder
 *  moves the whole run together. All returned elements are siblings of `el`. */
export function siblingRun(el: HTMLElement, stopSelector: string): HTMLElement[] {
  const run: HTMLElement[] = [el];
  for (let n = el.nextElementSibling; n; n = n.nextElementSibling) {
    if (!(n instanceof HTMLElement)) continue;
    if (n.matches(stopSelector)) break;
    run.push(n);
  }
  return run;
}

/** Run a site's candidate selectors and return the first selector's cards that clears MIN_CARDS. */
export function collectCards(doc: Document, site: SiteConfig): { cards: Card[]; usedSelector: string | null } {
  for (const sel of site.itemSelectors) {
    let els: HTMLElement[];
    try {
      els = Array.from(doc.querySelectorAll<HTMLElement>(sel));
    } catch {
      continue;
    }
    if (els.length < MIN_CARDS) continue;

    const cards: Card[] = [];
    const seen = new Set<string>();
    for (const el of els) {
      const title = clean(site.title(el));
      const id = site.cardId(el);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const tags = site.tags ? clean(site.tags(el)) : extractTags(el, title);
      const unit = site.unit ? site.unit(el) : undefined;
      cards.push({ el, id, title, tags, unit });
    }
    if (cards.length >= MIN_CARDS) return { cards, usedSelector: sel };
  }
  return { cards: [], usedSelector: null };
}

/** Probe helper: report match counts for every candidate selector (for tuning selectors live). */
export function probe(doc: Document, site: SiteConfig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sel of site.itemSelectors) {
    try {
      out[sel] = doc.querySelectorAll(sel).length;
    } catch {
      out[sel] = -1;
    }
  }
  return out;
}
