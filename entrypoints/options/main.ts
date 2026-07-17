import { getSettings, setSettings, type Provider } from '../../src/storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

async function load() {
  const s = await getSettings();
  $<HTMLInputElement>('devMode').checked = s.devMode;
  $<HTMLSelectElement>('provider').value = s.provider;
  $<HTMLInputElement>('anthropicKey').value = s.anthropicKey;
  $<HTMLSelectElement>('anthropicModel').value = s.anthropicModel;
  $<HTMLInputElement>('openaiKey').value = s.openaiKey;
  $<HTMLSelectElement>('openaiModel').value = s.openaiModel;
}

function toast(msg: string, ok = true) {
  const t = $('toast');
  t.textContent = msg;
  t.style.background = ok ? '#16a34a' : '#dc2626';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

$('save').addEventListener('click', async () => {
  await setSettings({
    devMode: $<HTMLInputElement>('devMode').checked,
    provider: $<HTMLSelectElement>('provider').value as Provider,
    anthropicKey: $<HTMLInputElement>('anthropicKey').value.trim(),
    anthropicModel: $<HTMLSelectElement>('anthropicModel').value,
    openaiKey: $<HTMLInputElement>('openaiKey').value.trim(),
    openaiModel: $<HTMLSelectElement>('openaiModel').value,
  });
  toast('Saved');
});

$('clear').addEventListener('click', async () => {
  await setSettings({ anthropicKey: '', openaiKey: '' });
  $<HTMLInputElement>('anthropicKey').value = '';
  $<HTMLInputElement>('openaiKey').value = '';
  toast('API keys cleared');
});

load();
