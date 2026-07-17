export interface Sample {
  id: string;
  title: string;
}

export interface Question {
  id: string;
  text: string;
  options: { id: string; label: string }[];
}

export interface Answer {
  questionId: string;
  optionId: string;
}

export interface BehaviorContext {
  // The raw interaction timeline — the LLM interprets this itself (no pre-judging).
  interactions?: string[];
  // Live signals captured at request time:
  localTime?: string; // e.g. "Saturday 22:40 (late night, weekend) — user's local time"
  selection?: string; // text the user currently has selected on the page
}

export interface PriorTurn {
  questionText: string;
  chosenLabel: string;
}

// The LLM's own reading of one observed behavior, before it asks/ranks.
export interface BehaviorReading {
  behavior: string; // what the user did (in their language)
  sentiment: 'positive' | 'neutral' | 'negative';
  why: string; // one short phrase
}

export type Request =
  | {
      kind: 'questions';
      siteId: string;
      samples: Sample[];
      behavior?: BehaviorContext;
      priorTurns?: PriorTurn[];
      userNotes?: string[];
    }
  | {
      kind: 'score';
      siteId: string;
      questions: Question[];
      answers: Answer[];
      items: Sample[];
      behavior?: BehaviorContext;
      userNotes?: string[];
      behaviorReading?: BehaviorReading[];
    }
  | { kind: 'embed'; texts: string[] }
  | { kind: 'ping' };

export type Response =
  | { ok: true; questions: Question[]; userStatus?: string; reasoning?: string; behaviorReading?: BehaviorReading[] }
  | { ok: true; scores: Record<string, number>; rationale?: string }
  | { ok: true; vectors: number[][] }
  | { ok: true; pong: true; ready: boolean; reason?: string }
  | { ok: false; error: string };
