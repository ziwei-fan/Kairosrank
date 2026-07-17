import { describe, it, expect, beforeEach } from 'vitest';
import { reorder, snapshot, restore, setHidden } from './reorder';
import type { Card } from '../sites/types';

function makeGrid(ids: string[]): { parent: HTMLElement; cards: Card[] } {
  const parent = document.createElement('div');
  const cards: Card[] = [];
  for (const id of ids) {
    const el = document.createElement('a');
    el.setAttribute('data-id', id);
    el.textContent = id;
    parent.appendChild(el);
    cards.push({ el, id, title: id, tags: '' });
  }
  document.body.appendChild(parent);
  return { parent, cards };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('reorder', () => {
  it('orders cards by score high→low, moving real nodes (identity preserved)', () => {
    const { parent, cards } = makeGrid(['a', 'b', 'c', 'd']);
    const refA = cards[0].el;
    reorder(cards, { a: 0.1, b: 0.9, c: 0.5, d: 0.2 });
    const order = Array.from(parent.children).map((c) => (c as HTMLElement).getAttribute('data-id'));
    expect(order).toEqual(['b', 'c', 'd', 'a']);
    expect(Array.from(parent.children).at(-1)).toBe(refA); // same node moved, not recreated
  });

  it('preserves listeners on moved nodes', () => {
    const { cards } = makeGrid(['a', 'b', 'c', 'd']);
    let clicks = 0;
    cards[0].el.addEventListener('click', () => clicks++);
    reorder(cards, { a: 0, b: 1, c: 1, d: 1 });
    cards[0].el.dispatchEvent(new Event('click'));
    expect(clicks).toBe(1);
  });

  it('reorders the wrapper CELL when the matched card is nested inside it', () => {
    // grid > cell > a  (the common real-world shape my earlier version failed on)
    const grid = document.createElement('div');
    const cards: Card[] = [];
    for (const id of ['a', 'b', 'c', 'd']) {
      const cell = document.createElement('div');
      cell.setAttribute('data-cell', id);
      const a = document.createElement('a');
      a.textContent = id;
      cell.appendChild(a);
      grid.appendChild(cell);
      cards.push({ el: a, id, title: id, tags: '' });
    }
    document.body.appendChild(grid);

    reorder(cards, { a: 0.1, b: 0.9, c: 0.5, d: 0.2 });
    // The CELLS should be reordered by their card's score, not the <a>s.
    const order = Array.from(grid.children).map((c) => (c as HTMLElement).getAttribute('data-cell'));
    expect(order).toEqual(['b', 'c', 'd', 'a']);
  });

  it('moves a multi-element unit (dt+dd) together, counting groups not elements', () => {
    // arXiv shape: one paper = a <dt> (anchor) immediately followed by its <dd>.
    const dl = document.createElement('dl');
    const cards: Card[] = [];
    for (const id of ['a', 'b', 'c', 'd']) {
      const dt = document.createElement('dt');
      dt.setAttribute('data-id', id);
      const dd = document.createElement('dd');
      dd.setAttribute('data-dd', id);
      dl.appendChild(dt);
      dl.appendChild(dd);
      cards.push({ el: dt, id, title: id, tags: '', unit: [dt, dd] });
    }
    document.body.appendChild(dl);

    const { moved } = reorder(cards, { a: 0.1, b: 0.9, c: 0.5, d: 0.2 });
    const order = Array.from(dl.children).map((c) => {
      const e = c as HTMLElement;
      return e.tagName === 'DT' ? e.getAttribute('data-id') : 'dd:' + e.getAttribute('data-dd');
    });
    // Each dt stays glued to its dd, and pairs are ranked b > c > d > a.
    expect(order).toEqual(['b', 'dd:b', 'c', 'dd:c', 'd', 'dd:d', 'a', 'dd:a']);
    expect(moved).toBe(4); // 4 groups moved, not 8 elements
  });

  it('hides and restores units reversibly by id (demote already-seen)', () => {
    const { cards } = makeGrid(['a', 'b', 'c', 'd']);
    const { hidden } = setHidden(cards, new Set(['b', 'd']));
    expect(hidden).toBe(2);
    expect(cards[1].el.style.display).toBe('none');
    expect(cards[3].el.style.display).toBe('none');
    expect(cards[0].el.style.display).not.toBe('none');
    // Toggling off (empty set) reveals everything and clears the marker.
    setHidden(cards, new Set());
    expect(cards[1].el.style.display).not.toBe('none');
    expect(cards[1].el.hasAttribute('data-jit-hidden')).toBe(false);
  });

  it('hides a multi-element unit (dt+dd) as a whole', () => {
    const dl = document.createElement('dl');
    const cards: Card[] = [];
    for (const id of ['a', 'b', 'c', 'd']) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dl.append(dt, dd);
      cards.push({ el: dt, id, title: id, tags: '', unit: [dt, dd] });
    }
    document.body.appendChild(dl);
    setHidden(cards, new Set(['b']));
    expect(cards[1].unit![0].style.display).toBe('none'); // dt
    expect(cards[1].unit![1].style.display).toBe('none'); // dd
    expect(cards[0].unit![0].style.display).not.toBe('none');
  });

  it('snapshot + restore returns original order', () => {
    const { parent, cards } = makeGrid(['a', 'b', 'c', 'd']);
    const snaps = snapshot(cards);
    reorder(cards, { a: 0, b: 1, c: 0.5, d: 0.2 });
    restore(snaps);
    const order = Array.from(parent.children).map((c) => (c as HTMLElement).getAttribute('data-id'));
    expect(order).toEqual(['a', 'b', 'c', 'd']);
  });
});
