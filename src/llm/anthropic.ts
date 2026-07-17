import type { Sample, Question, Answer, BehaviorContext, PriorTurn, BehaviorReading } from '../messages';
import { QUESTION_SYSTEM_PROMPT, SCORE_SYSTEM_PROMPT, QUESTION_TOOL, SCORE_TOOL } from './prompts';
import {
  buildQuestionMessage,
  buildScoreMessage,
  chunkItems,
  mergeChunkScores,
  type QuestionResult,
  type ScoreResult,
} from './format';

export type { QuestionResult, ScoreResult } from './format';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

interface MessagesResponse {
  content: ({ type: string } & Record<string, unknown>)[];
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
  error?: { type: string; message: string };
}

async function call(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  tool: typeof QUESTION_TOOL | typeof SCORE_TOOL,
  maxTokens: number,
): Promise<unknown> {
  const body = {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userMessage }],
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as MessagesResponse;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Anthropic API error: ${msg}`);
  }

  const toolUse = json.content.find((b) => b.type === 'tool_use') as ToolUseBlock | undefined;
  if (!toolUse) throw new Error('No tool_use block in Anthropic response');

  if (json.usage) console.log('[jit-rerank] anthropic usage:', json.usage);
  return toolUse.input;
}

export async function generateQuestions(
  apiKey: string,
  model: string,
  siteId: string,
  samples: Sample[],
  behavior?: BehaviorContext,
  priorTurns?: PriorTurn[],
  userNotes?: string[],
): Promise<QuestionResult> {
  const userMessage = buildQuestionMessage(siteId, samples, behavior, priorTurns, userNotes);
  const out = (await call(apiKey, model, QUESTION_SYSTEM_PROMPT, userMessage, QUESTION_TOOL, 1500)) as QuestionResult;
  return {
    questions: out.questions,
    userStatus: out.userStatus,
    reasoning: out.reasoning,
    behaviorReading: out.behaviorReading,
  };
}

export async function scoreItems(
  apiKey: string,
  model: string,
  questions: Question[],
  answers: Answer[],
  items: Sample[],
  behavior?: BehaviorContext,
  userNotes?: string[],
  behaviorReading?: BehaviorReading[],
): Promise<ScoreResult> {
  const chunkResults = await Promise.all(
    chunkItems(items).map(async (chunk) => {
      const userMessage = buildScoreMessage(chunk, questions, answers, behavior, userNotes, behaviorReading);
      const out = (await call(apiKey, model, SCORE_SYSTEM_PROMPT, userMessage, SCORE_TOOL, 4096)) as {
        scores: { id: string; score: number }[];
        rationale?: string;
      };
      return { chunk, scores: out.scores, rationale: out.rationale };
    }),
  );
  return mergeChunkScores(chunkResults);
}
