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

// OpenAI Chat Completions with forced function-calling — mirrors the Anthropic adapter
// so the background can swap providers transparently. Reuses the exact same prompts +
// context builders (src/llm/format.ts), so questions/scores are identical in shape.
//
// Runs from the background service worker; the extension's host_permissions for
// api.openai.com let it fetch cross-origin without CORS (same as the Anthropic path).

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

interface ChatResponse {
  choices?: { message?: { tool_calls?: { function?: { name: string; arguments: string } }[] } }[];
  usage?: Record<string, number>;
  error?: { message?: string; type?: string };
}

// Convert an Anthropic-style tool ({name, description, input_schema}) to OpenAI's
// function tool ({type:'function', function:{name, description, parameters}}).
function toOpenAiTool(tool: typeof QUESTION_TOOL | typeof SCORE_TOOL) {
  return { type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: tool.input_schema } };
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
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    tools: [toOpenAiTool(tool)],
    tool_choice: { type: 'function', function: { name: tool.name } },
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as ChatResponse;
  if (!res.ok || json.error) {
    throw new Error(`OpenAI API error: ${json.error?.message ?? `HTTP ${res.status}`}`);
  }

  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('No tool_call in OpenAI response');
  if (json.usage) console.log('[jit-rerank] openai usage:', json.usage);
  try {
    return JSON.parse(args);
  } catch {
    throw new Error('OpenAI returned malformed tool arguments');
  }
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
