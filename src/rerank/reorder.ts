import type { Card } from '../sites/types';
import { log } from '../logger';

export interface Snapshot {
  container: HTMLElement;
  order: HTMLElement[];
}

const MAX_WALKUP = 6;
const MIN_SIBLINGS = 4;

// The matched card element (often an <a>) may be nested inside a wrapper "cell".
// Find the grid container (nearest ancestor holding >= MIN_SIBLINGS of the matched
// cards) and the "movable unit" = the container's direct child that holds this card.
function resolveUnit(cardEl: HTMLElement, cardSet: HTMLElement[]): { container: HTMLElement; unit: HTMLElement } | null {
  let cur: HTMLElement | null = cardEl;
  for (let d = 0; cur && d < MAX_WALKUP; d++) {
    const parent: HTMLElement | null = cur.parentElement;
    if (!parent) break;
    let count = 0;
    for (const c of cardSet) if (parent.contains(c)) count++;
    if (count >= MIN_SIBLINGS) return { container: parent, unit: cur };
    cur = parent;
  }
  return null;
}

// A movable visual unit: one or more sibling elements that must travel together.
// Single-element for the video grids (a card cell); multi-element for list layouts
// where one item spans siblings (arXiv <dt>+<dd>, HN title-row + subtext + spacer).
interface Group {
  container: HTMLElement;
  els: HTMLElement[]; // ordered elements composing the unit; els[0] is the anchor
  id: string; // the Card.id score key
}

function resolveCardGroup(card: Card, cardSet: HTMLElement[]): Group | null {
  // Adapter-declared multi-element unit.
  if (card.unit && card.unit.length) {
    const els = card.unit.filter((e): e is HTMLElement => e instanceof HTMLElement && e.isConnected);
    if (!els.length) return null;
    const container = els[0].parentElement;
    if (!container) return null;
    // All group elements must be siblings under one container to move coherently.
    const sameParent = els.filter((e) => e.parentElement === container);
    return { container, els: sameParent, id: card.id };
  }
  // Single-element unit: walk up to the grid container that holds the sibling cards.
  const r = resolveUnit(card.el, cardSet);
  if (!r) return null;
  return { container: r.container, els: [r.unit], id: card.id };
}

function resolveGroups(cards: Card[]): { byContainer: Map<HTMLElement, Group[]> } {
  const cardSet = cards.map((c) => c.el);
  const byContainer = new Map<HTMLElement, Group[]>();
  const seenAnchor = new Set<HTMLElement>();

  for (const card of cards) {
    const g = resolveCardGroup(card, cardSet);
    if (!g || !g.els.length) continue;
    const anchor = g.els[0];
    if (seenAnchor.has(anchor)) continue; // two cards resolving to the same unit → keep the first
    seenAnchor.add(anchor);
    if (!byContainer.has(g.container)) byContainer.set(g.container, []);
    byContainer.get(g.container)!.push(g);
  }
  // Order the groups within each container by current DOM position of their anchor,
  // so before/after comparison and snapshot/restore reflect the real layout.
  for (const [container, groups] of byContainer) {
    const pos = new Map<Element, number>();
    Array.from(container.children).forEach((c, i) => pos.set(c, i));
    groups.sort((a, b) => (pos.get(a.els[0]) ?? 0) - (pos.get(b.els[0]) ?? 0));
  }
  return { byContainer };
}

export function snapshot(cards: Card[]): Snapshot[] {
  const { byContainer } = resolveGroups(cards);
  const snaps: Snapshot[] = [];
  for (const [container] of byContainer) {
    snaps.push({
      container,
      order: Array.from(container.children).filter((c): c is HTMLElement => c instanceof HTMLElement),
    });
  }
  return snaps;
}

export function restore(snaps: Snapshot[]): void {
  for (const s of snaps) {
    for (const el of s.order) {
      if (el.parentNode === s.container) {
        el.style.removeProperty('order');
        s.container.appendChild(el);
      }
    }
  }
}

export function reorder(cards: Card[], scores: Record<string, number>): { moved: number; changed: number } {
  const { byContainer } = resolveGroups(cards);
  let moved = 0;
  let changed = 0;
  let containerN = 0;

  for (const [container, groups] of byContainer) {
    containerN++;
    const before = groups.map((g) => g.id);
    const ordered = [...groups].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
    const after = ordered.map((g) => g.id);
    const didChange = before.some((id, i) => id !== after[i]);

    ordered.forEach((g, i) => {
      // Append the group's elements consecutively in best→worst order. For flex/grid
      // containers the `order` lock also enforces it; for block/table layouts the
      // physical append is what reorders. Multi-element units stay contiguous.
      for (const el of g.els) {
        el.style.removeProperty('transform');
        el.style.removeProperty('left');
        el.style.removeProperty('top');
        el.style.setProperty('order', String(i), 'important');
        container.appendChild(el);
      }
      moved++;
    });
    if (didChange) {
      changed++;
      flash(ordered[0].els[0]);
    }
    const cls = (container.getAttribute('class') ?? '').split(/\s+/)[0] || '(no class)';
    log(
      `container #${containerN} <${container.tagName.toLowerCase()}.${cls}> — ${groups.length} units, order ${didChange ? 'CHANGED' : 'unchanged'}`,
      didChange ? '#10b981' : '#f59e0b',
    );
  }

  if (byContainer.size === 0) {
    log('reorder: resolved 0 containers — cards may be detached or not siblings', '#ef4444');
  }
  nudgeLazyImages(cards);
  return { moved, changed };
}

// Reversibly hide/show whole units by id (for "hide seen"). Group-aware: an arXiv
// dt+dd or an HN 3-row story hides/shows as one. Idempotent — call with an empty set
// to reveal everything. Stores the element's prior inline `display` so restore is exact.
const HIDE_ATTR = 'data-jit-hidden';
export function setHidden(cards: Card[], hiddenIds: Set<string>): { hidden: number } {
  const { byContainer } = resolveGroups(cards);
  let hidden = 0;
  for (const [, groups] of byContainer) {
    for (const g of groups) {
      const shouldHide = hiddenIds.has(g.id);
      if (shouldHide) hidden++;
      for (const el of g.els) {
        if (shouldHide) {
          if (!el.hasAttribute(HIDE_ATTR)) {
            el.setAttribute(HIDE_ATTR, el.style.display || '');
            el.style.setProperty('display', 'none', 'important');
          }
        } else if (el.hasAttribute(HIDE_ATTR)) {
          const prev = el.getAttribute(HIDE_ATTR) || '';
          el.removeAttribute(HIDE_ATTR);
          if (prev) el.style.display = prev;
          else el.style.removeProperty('display');
        }
      }
    }
  }
  return { hidden };
}

function flash(el: HTMLElement): void {
  const prev = el.style.outline;
  el.style.outline = '3px solid #3b82f6';
  el.style.outlineOffset = '-3px';
  window.setTimeout(() => {
    el.style.outline = prev;
  }, 1600);
}

const LAZY_ATTRS = ['data-src', 'data-original', 'data-lazy-src'];
function nudgeLazyImages(cards: Card[]): void {
  for (const c of cards) {
    for (const img of Array.from(c.el.querySelectorAll('img'))) {
      if (img.loading === 'lazy') img.loading = 'eager';
      const src = img.getAttribute('src') ?? '';
      if (!src || /placeholder|loading|blank|^data:/i.test(src)) {
        for (const a of LAZY_ATTRS) {
          const v = img.getAttribute(a);
          if (v) {
            img.src = v;
            break;
          }
        }
      }
    }
  }
}
