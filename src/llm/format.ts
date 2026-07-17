// Provider-agnostic prompt building + score merging, shared by the Anthropic and
// OpenAI adapters so both send identical context and parse results the same way.

import type { Sample, Question, Answer, BehaviorContext, PriorTurn, BehaviorReading } from '../messages';

export const SCORE_CHUNK_SIZE = 40;

/** Detect the dominant script of the item titles so the model answers in the page's language. */
function langDirective(texts: string[]): string {
  const s = texts.join(' ');
  const cjk = (s.match(/[㐀-鿿]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  const lang = cjk > latin ? 'Simplified Chinese (简体中文)' : 'English';
  return `Respond ENTIRELY in ${lang} — the language of the items on this page. Every field (question, option labels, userStatus, reasoning, rationale) must be written in ${lang}.`;
}

export interface QuestionResult {
  questions: Question[];
  userStatus?: string;
  reasoning?: string;
  behaviorReading?: BehaviorReading[];
}
export interface ScoreResult {
  scores: Record<string, number>;
  rationale?: string;
}

function formatBehavior(b?: BehaviorContext): string {
  const parts: string[] = [];
  if (b?.localTime) parts.push(`It is currently ${b.localTime}.`);
  if (b?.selection) parts.push(`The user has this text selected on the page right now: “${b.selection}”`);

  const log = b?.interactions ?? [];
  if (log.length > 0) {
    parts.push(
      'The user\'s recent interaction timeline (raw — YOU interpret it). Note how long they watched each video (a quick exit usually means they were not interested; a long watch means they liked it), what they searched, what filters they set, and what they lingered on:\n' +
        log.map((l) => `  ${l}`).join('\n'),
    );
  }

  if (parts.length === 0) return 'Behavioral signals: (none yet — new user)';
  return parts.join('\n');
}

function formatPriorTurns(turns?: PriorTurn[]): string {
  if (!turns || turns.length === 0) return 'Prior turns: (none — this is turn 1)';
  return (
    `Prior turns this conversation:\n` +
    turns.map((t, i) => `Turn ${i + 1}:\n  Q: ${t.questionText}\n  A: ${t.chosenLabel}`).join('\n')
  );
}

function formatNotes(notes?: string[]): string {
  const list = (notes ?? []).map((n) => n.trim()).filter(Boolean);
  if (list.length === 0) return '=== USER NOTES: (none — empty) ===';
  return (
    `=== USER NOTES — THIS IS THE STRONGEST PREFERENCE SIGNAL ===\n` +
    `The user has typed and sent the following free-text notes (chronological, most recent last). Treat them as the most explicit and authoritative statement of what they want. Newer notes take precedence over older ones if they conflict.\n` +
    list.map((n, i) => `Note ${i + 1}: """${n}"""`).join('\n') +
    `\n=== END USER NOTES ===`
  );
}

function formatReading(reading?: BehaviorReading[]): string {
  if (!reading || reading.length === 0) return '';
  const sign = (s: string) => (s === 'positive' ? '➕' : s === 'negative' ? '➖' : '◦');
  return (
    'Your earlier behavior reading (stay consistent with this):\n' +
    reading.map((r) => `  ${sign(r.sentiment)} ${r.behavior} — ${r.why}`).join('\n')
  );
}

/** The user message for question generation (identical across providers). */
export function buildQuestionMessage(
  siteId: string,
  samples: Sample[],
  behavior?: BehaviorContext,
  priorTurns?: PriorTurn[],
  userNotes?: string[],
): string {
  const formatted = samples
    .slice(0, 30)
    .map((s, i) => `${i + 1}. ${s.title}`)
    .join('\n');
  return (
    `${langDirective(samples.map((s) => s.title))}\n\n` +
    `Site: ${siteId}\n\n` +
    `${formatNotes(userNotes)}\n\n` +
    `${formatPriorTurns(priorTurns)}\n\n` +
    `${formatBehavior(behavior)}\n\n` +
    `Sampled items currently visible:\n${formatted}\n\nGenerate the next question.`
  );
}

export function chunkItems(items: Sample[]): Sample[][] {
  const chunks: Sample[][] = [];
  for (let i = 0; i < items.length; i += SCORE_CHUNK_SIZE) chunks.push(items.slice(i, i + SCORE_CHUNK_SIZE));
  return chunks;
}

/** The user message for scoring one chunk (identical across providers). */
export function buildScoreMessage(
  chunk: Sample[],
  questions: Question[],
  answers: Answer[],
  behavior?: BehaviorContext,
  userNotes?: string[],
  behaviorReading?: BehaviorReading[],
): string {
  const qaText = questions
    .map((q) => {
      const a = answers.find((x) => x.questionId === q.id);
      const chosen = q.options.find((o) => o.id === a?.optionId);
      return `Q: ${q.text}\nA: ${chosen?.label ?? '(none)'}`;
    })
    .join('\n\n');
  const readingText = formatReading(behaviorReading);
  const formatted = chunk.map((it, i) => `${i + 1}. ${it.title}`).join('\n');
  return (
    `${langDirective(chunk.map((it) => it.title))}\n\n` +
    `${formatNotes(userNotes)}\n\n` +
    (readingText ? `${readingText}\n\n` : '') +
    `${formatBehavior(behavior)}\n\n` +
    `User answers:\n${qaText}\n\n` +
    `Items to score (numbered 1-${chunk.length}). For each item, return its NUMBER (as a string, e.g. "1", "2", ...) and a score 0-1.\n\n${formatted}`
  );
}

/** Map the model's number-keyed scores back to item ids across chunks. */
export function mergeChunkScores(
  chunkResults: { chunk: Sample[]; scores: { id: string; score: number }[]; rationale?: string }[],
): ScoreResult {
  const rationale = chunkResults.find((r) => r.rationale)?.rationale;
  const scoreMap: Record<string, number> = {};
  let matched = 0;
  let unmatched = 0;
  for (const { chunk, scores } of chunkResults) {
    for (const { id, score } of scores) {
      const idx = parseInt(String(id).trim().replace(/^[^\d]+/, ''), 10) - 1;
      if (idx >= 0 && idx < chunk.length) {
        scoreMap[chunk[idx].id] = Math.max(0, Math.min(1, score));
        matched++;
      } else {
        unmatched++;
      }
    }
  }
  console.log(`[jit-rerank] score id-match: ${matched} matched, ${unmatched} unmatched`);
  return { scores: scoreMap, rationale };
}
