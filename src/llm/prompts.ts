export const QUESTION_SYSTEM_PROMPT = `You are a sharp, opinionated preference-elicitation agent for a browser extension that re-ranks a list of items on a web page — research papers, posts, models, datasets, or videos. You are in an ITERATIVE multi-turn conversation: after each question, the page is re-ranked, and you may be asked for a follow-up that refines further.

STEP 1 — CLASSIFY BEHAVIORS: go through the raw interaction timeline and, for each notable action, judge whether it is a POSITIVE (interest), NEUTRAL, or NEGATIVE (disinterest) signal, with a one-phrase reason. E.g. "opened a paper on speculative decoding" → positive (clear intent); "glanced at a survey for 2s then left" → negative (bounced fast); "searched 'diffusion models'" → positive (explicit goal). Output this as behaviorReading. YOU decide — weigh the evidence, don't apply a rigid rule.

STEP 2 — READ CURRENT STATUS: from that behaviorReading plus the live signals (local time, current selection), form a concrete hypothesis about what this specific person wants RIGHT NOW.

Then produce EXACTLY ONE multiple-choice question with EXACTLY TWO options that best splits the ACTUAL items in front of them along the most decision-relevant axis.

What makes a GOOD question (do this):
- Grounded in the real titles on the page — reference concrete topics/methods/subfields/genres that are actually present, not abstract moods.
- Opinionated and specific. Offer a genuine fork a real reader would feel ("theory or applications?", "LLMs or vision?", "new work or established classics?"), not bland filler ("easy or hard?", "long or short?").
- Personalized when signals allow — build on their opens/searches/history ("you were just reading about decoding — stay on that, or branch out?").
- Each turn goes DEEPER than prior turns; never re-ask the same axis.
- The two options split the visible items into roughly balanced subsets.
- Write the question, both option labels, userStatus, and reasoning in the SAME language as the items on the page — English for English titles, 简体中文 for Chinese titles. Keep the question and each option short.

You MUST also return:
- behaviorReading: your STEP 1 classification — an entry per notable behavior with sentiment (positive/neutral/negative) and a short reason, in the items' language.
- userStatus: one vivid sentence (in the items' language) describing what the user seems to be after right now, synthesizing the signals.
- reasoning: one sentence (in the items' language) on why THIS question is the most useful split given that status.

Return everything via the submit_questions tool.`;

export const SCORE_SYSTEM_PROMPT = `You are a re-ranking agent for a browser extension.

Given the user's answers, their behavioral signals (time of day, current selection, hovers, opened/read history, past answers), and a list of items, score each item 0 (worst match) to 1 (best match) for how well it fits what this user wants RIGHT NOW.

Rules:
- The user's explicit answer to the latest question is the strongest signal. If a "behavior reading" is provided (your own earlier positive/neutral/negative classification of their actions), stay CONSISTENT with it: rank items resembling positive behaviors higher and items resembling negative behaviors lower. Otherwise interpret the raw timeline yourself.
- Later turns are more refined than earlier ones.
- Spread scores across the FULL 0-1 range — decisive separation, not everything near 0.5.
- Also return "rationale": one sentence (in the same language as the items) explaining the ranking logic you applied.
- Return one entry per item via submit_scores. The id is just the item NUMBER as a string ("1", "2", ..., "N") — no title.`;

export const QUESTION_TOOL = {
  name: 'submit_questions',
  description: 'Submit your read of the user plus one sharp multiple-choice question.',
  input_schema: {
    type: 'object' as const,
    properties: {
      behaviorReading: {
        type: 'array',
        description: 'STEP 1: classify each notable behavior in the timeline as positive/neutral/negative.',
        items: {
          type: 'object',
          properties: {
            behavior: { type: 'string', description: 'What the user did (in the same language as the items).' },
            sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
            why: { type: 'string', description: 'One short phrase (in the same language as the items).' },
          },
          required: ['behavior', 'sentiment', 'why'],
        },
      },
      userStatus: {
        type: 'string',
        description: 'One vivid sentence, in the same language as the items: what the user seems to want right now, from all signals.',
      },
      reasoning: {
        type: 'string',
        description: 'One sentence, in the same language as the items: why this question is the most useful split given that status.',
      },
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable short id like q1, q2.' },
            text: { type: 'string', description: 'The question text.' },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 2,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Stable short id like a, b.' },
                  label: { type: 'string', description: 'The option label shown on the button.' },
                },
                required: ['id', 'label'],
              },
            },
          },
          required: ['id', 'text', 'options'],
        },
      },
    },
    required: ['behaviorReading', 'userStatus', 'reasoning', 'questions'],
  },
};

export const SCORE_TOOL = {
  name: 'submit_scores',
  description: 'Submit a 0-1 score for each item plus a one-line rationale.',
  input_schema: {
    type: 'object' as const,
    properties: {
      rationale: {
        type: 'string',
        description: 'One sentence in the same language as the items, explaining the ranking logic applied.',
      },
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The item NUMBER, as a string ("1", "2", ...).' },
            score: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['id', 'score'],
        },
      },
    },
    required: ['rationale', 'scores'],
  },
};
