import { describe, it, expect, beforeEach } from 'vitest';
import { pickSite, collectCards, probe } from './index';
import { iyf } from './iyf';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pickSite', () => {
  it('matches iyf hosts', () => {
    expect(pickSite('www.iyf.tv')?.id).toBe('iyf');
    expect(pickSite('example.com')).toBeNull();
  });
});

describe('iyf collectCards', () => {
  it('finds /play/ cards and extracts title + id', () => {
    const grid = document.createElement('div');
    for (let i = 0; i < 6; i++) {
      const a = document.createElement('a');
      a.setAttribute('href', `/play/vid${i}`);
      a.innerHTML = `<img alt="ignore"><span class="title">Show ${i}</span>`;
      grid.appendChild(a);
    }
    document.body.appendChild(grid);

    const { cards, usedSelector } = collectCards(document, iyf);
    expect(usedSelector).toBe('a[href*="/play/"]');
    expect(cards.length).toBe(6);
    expect(cards[0].title).toBe('Show 0');
    expect(cards[0].id).toBe('/play/vid0');
  });
});

describe('probe', () => {
  it('reports match counts per candidate selector', () => {
    const grid = document.createElement('div');
    for (let i = 0; i < 3; i++) {
      const a = document.createElement('a');
      a.setAttribute('href', `/play/x${i}`);
      grid.appendChild(a);
    }
    document.body.appendChild(grid);
    const counts = probe(document, iyf);
    expect(counts['a[href*="/play/"]']).toBe(3);
  });
});
