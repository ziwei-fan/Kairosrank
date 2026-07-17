import { describe, it, expect, beforeEach } from 'vitest';
import { collectCards } from './types';
import { paperswithcode } from './paperswithcode';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('paperswithcode.co adapter', () => {
  // Mirrors the live DOM: div.paper-list > article.paper-card > (h3.paper-title a[/paper/id] + .paper-abstract).
  function build(items: { id: string; title: string; abstract: string; tags?: string[] }[]): void {
    const list = document.createElement('div');
    list.className = 'paper-list';
    for (const it of items) {
      const card = document.createElement('article');
      card.className = 'paper-card';
      const h3 = document.createElement('h3');
      h3.className = 'paper-title';
      const a = document.createElement('a');
      a.setAttribute('href', `/paper/${it.id}`);
      a.textContent = it.title;
      h3.appendChild(a);
      const abs = document.createElement('p');
      abs.className = 'paper-abstract';
      abs.textContent = it.abstract;
      card.append(h3, abs);
      for (const t of it.tags ?? []) {
        const ta = document.createElement('a');
        ta.setAttribute('href', `/task/${t.toLowerCase()}`);
        ta.textContent = t;
        card.appendChild(ta);
      }
      list.appendChild(card);
    }
    document.body.appendChild(list);
  }

  it('collects paper cards with title, /paper/ id, and abstract+tag embedding text', () => {
    build([
      { id: '2602.06036', title: 'DFlash: Block Diffusion for Flash Speculative Decoding', abstract: 'Autoregressive LLMs are sequential; we speed up decoding.', tags: ['Speculative-Decoding'] },
      { id: '2604.00688', title: 'OmniVoice: Zero-Shot Text-to-Speech', abstract: 'Diffusion language models for multilingual TTS.' },
      { id: '2601.15621', title: 'Qwen3-TTS Technical Report', abstract: 'A text-to-speech technical report.' },
      { id: '2601.18184', title: 'VIBEVOICE-ASR Technical Report', abstract: 'Automatic speech recognition system.', tags: ['Tedlium'] },
    ]);
    const { cards, usedSelector } = collectCards(document, paperswithcode);
    expect(usedSelector).toBe('article.paper-card');
    expect(cards.length).toBe(4);
    expect(cards[0].title).toBe('DFlash: Block Diffusion for Flash Speculative Decoding');
    expect(cards[0].id).toBe('/paper/2602.06036');
    expect(cards[0].tags).toContain('Speculative-Decoding'); // linked task tag
    expect(cards[0].tags).toContain('speed up decoding'); // abstract folded in
  });

  it('detects an opened /paper/ page, ignores the listing homepage', () => {
    expect(paperswithcode.videoPage('https://paperswithcode.co/paper/2602.06036')?.id).toBe('/paper/2602.06036');
    expect(paperswithcode.videoPage('https://paperswithcode.co/')).toBeNull();
  });

  it('matches .co but not the dead .com', () => {
    expect(paperswithcode.matches('paperswithcode.co')).toBe(true);
    expect(paperswithcode.matches('www.paperswithcode.co')).toBe(true);
    expect(paperswithcode.matches('paperswithcode.com')).toBe(false);
  });
});
