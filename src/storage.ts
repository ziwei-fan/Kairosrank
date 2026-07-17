export type Provider = 'anthropic' | 'openai';

export interface Settings {
  provider: Provider; // which cloud LLM the question/score calls use
  anthropicKey: string;
  openaiKey: string;
  anthropicModel: string;
  openaiModel: string;
  devMode: boolean;
  autoSuggest: boolean; // monitor offers a re-rank when you seem stuck
  proactive: boolean; // auto-open and ask as soon as a page loads (opt-in)
  hideSeen: boolean; // hide items already opened on this site (triage aid)
  perSite: Record<string, { enabled: boolean }>;
}

const DEFAULT: Settings = {
  provider: 'anthropic',
  anthropicKey: '',
  openaiKey: '',
  anthropicModel: 'claude-haiku-4-5', // smallest/cheapest Anthropic tier
  openaiModel: 'gpt-4o-mini', // smallest/cheapest OpenAI tier
  devMode: true,
  autoSuggest: true,
  proactive: false,
  hideSeen: false,
  perSite: {},
};

export async function getSettings(): Promise<Settings> {
  try {
    if (!chrome?.runtime?.id) return { ...DEFAULT };
    const stored = await chrome.storage.local.get('settings');
    const s = (stored.settings as Record<string, unknown>) ?? {};
    const merged: Settings = { ...DEFAULT, ...(s as Partial<Settings>) };
    // Migrate the legacy single-provider layout (apiKey / model → anthropic*).
    if (typeof s.apiKey === 'string' && s.apiKey && !s.anthropicKey) merged.anthropicKey = s.apiKey;
    if (typeof s.model === 'string' && s.model && !s.anthropicModel) merged.anthropicModel = s.model;
    return merged;
  } catch {
    return { ...DEFAULT };
  }
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  try {
    if (chrome?.runtime?.id) await chrome.storage.local.set({ settings: next });
  } catch {
    /* extension context gone — ignore */
  }
  return next;
}

/** The active provider's API key + model, for the background dispatcher. */
export function activeKey(s: Settings): string {
  return s.provider === 'openai' ? s.openaiKey : s.anthropicKey;
}
export function activeModel(s: Settings): string {
  return s.provider === 'openai' ? s.openaiModel : s.anthropicModel;
}

export async function isSiteEnabled(host: string): Promise<boolean> {
  const s = await getSettings();
  return s.perSite[host]?.enabled ?? true;
}
