import { describe, it, expect, beforeEach } from 'vitest';
import { collectCards } from './types';
import { huggingface } from './huggingface';

beforeEach(() => {
  document.body.innerHTML = '';
});

function buildCard(kind: 'model' | 'dataset', owner: string, name: string, meta: string): HTMLElement {
  const art = document.createElement('article');
  art.className = 'overview-card-wrapper group/repo';
  const a = document.createElement('a');
  a.setAttribute('href', kind === 'dataset' ? `/datasets/${owner}/${name}` : `/${owner}/${name}`);
  const header = document.createElement('header');
  header.setAttribute('title', `${owner}/${name}`);
  const h4 = document.createElement('h4');
  h4.textContent = name;
  header.appendChild(h4);
  a.appendChild(header);
  const m = document.createElement('div');
  m.className = 'text-gray-400';
  m.textContent = meta;
  art.append(a, m);
  return art;
}

describe('huggingface adapter', () => {
  it('collects model/dataset cards with title, task tags, and href ids', () => {
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 gap-5';
    grid.append(
      buildCard('model', 'meta-llama', 'Llama-4-70B', 'Text Generation • 70B • Updated 2d ago'),
      buildCard('model', 'Qwen', 'Qwen3-30B', 'Text Generation • 30B • Updated 5h ago'),
      buildCard('dataset', 'allenai', 'c4', 'Viewer • 1B rows • Updated Jul 1'),
      buildCard('model', 'google', 'gemma-3', 'Image-Text-to-Text • Updated 1d ago'),
      buildCard('dataset', 'squad', 'plain_text', 'Viewer • 100k rows'),
    );
    document.body.appendChild(grid);

    const { cards, usedSelector } = collectCards(document, huggingface);
    expect(usedSelector).toBe('article.overview-card-wrapper');
    expect(cards.length).toBe(5);
    expect(cards[0].title).toBe('meta-llama/Llama-4-70B');
    expect(cards[0].tags).toContain('Text Generation');
    expect(cards[0].id).toBe('/meta-llama/Llama-4-70B');
    expect(cards[2].id).toBe('/datasets/allenai/c4');
  });

  it('classifies opened detail pages across all three surfaces', () => {
    expect(huggingface.videoPage('https://huggingface.co/meta-llama/Llama-4-70B')?.id).toBe('/meta-llama/Llama-4-70B');
    expect(huggingface.videoPage('https://huggingface.co/datasets/allenai/c4')?.id).toBe('/datasets/allenai/c4');
    expect(huggingface.videoPage('https://huggingface.co/papers/2607.03118')?.id).toBe('/papers/2607.03118');
    // A repo subpage still resolves to the repo id.
    expect(huggingface.videoPage('https://huggingface.co/google/gemma-3/tree/main')?.id).toBe('/google/gemma-3');
  });

  it('does NOT treat listing/section pages as opened items', () => {
    expect(huggingface.videoPage('https://huggingface.co/models')).toBeNull();
    expect(huggingface.videoPage('https://huggingface.co/datasets')).toBeNull();
    expect(huggingface.videoPage('https://huggingface.co/settings/tokens')).toBeNull();
    expect(huggingface.videoPage('https://huggingface.co/')).toBeNull();
  });
});
