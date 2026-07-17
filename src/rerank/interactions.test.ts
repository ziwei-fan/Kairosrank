import { describe, it, expect, beforeEach } from 'vitest';
import { Interactions } from './interactions';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Interactions', () => {
  it('parses filters from the URL and fires onHunt on change', () => {
    let hunts = 0;
    const ix = new Interactions({ onHunt: () => hunts++ });
    ix.noteUrl('https://www.iyf.tv/list/drama?region=%E5%A4%A7%E9%99%86&orderBy=2');
    const snap = ix.snapshot();
    expect(snap.filters).toContain('drama');
    expect(snap.filters).toContain('region=大陆');
    expect(snap.filters).toContain('orderBy=2');
    expect(hunts).toBe(1);
    // same URL again → no new hunt
    ix.noteUrl('https://www.iyf.tv/list/drama?region=%E5%A4%A7%E9%99%86&orderBy=2');
    expect(hunts).toBe(1);
  });

  it('captures a search query on Enter in a search field', () => {
    let hunts = 0;
    const ix = new Interactions({ onHunt: () => hunts++ });
    ix.start();
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = '搜索影片';
    input.value = '危险关系';
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ix.snapshot().searches).toEqual(['危险关系']);
    expect(hunts).toBe(1);
  });

  it('ignores Enter on non-search inputs', () => {
    const ix = new Interactions();
    ix.start();
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'comment';
    input.value = 'hello';
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ix.snapshot().searches).toEqual([]);
  });
});
