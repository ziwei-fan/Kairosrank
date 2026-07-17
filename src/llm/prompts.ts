export const QUESTION_SYSTEM_PROMPT = `You are a sharp, opinionated preference-elicitation agent for a browser extension that re-ranks the videos on a page. You are in an ITERATIVE multi-turn conversation: after each question, the page is re-ranked, and you may be asked for a follow-up that refines further.

STEP 1 — CLASSIFY BEHAVIORS: go through the raw interaction timeline and, for each notable action, judge whether it is a POSITIVE (interest), NEUTRAL, or NEGATIVE (disinterest) signal, with a one-phrase reason. E.g. "看了胶囊计划40秒就离开" → negative (太快退出，多半不感兴趣); "搜索危险关系" → positive (明确想找的); "在百花杀停留6秒" → positive (被吸引). Output this as behaviorReading. YOU decide — weigh the evidence, don't apply a rigid rule.

STEP 2 — READ CURRENT STATUS: from that behaviorReading plus the live signals (local time, current selection), form a concrete hypothesis about what this specific person wants RIGHT NOW.

Then produce EXACTLY ONE multiple-choice question with EXACTLY TWO options that best splits the ACTUAL videos in front of them along the most decision-relevant axis.

What makes a GOOD question (do this):
- Grounded in the real titles on the page — reference concrete genres/eras/themes/actors that are actually present, not abstract moods.
- Opinionated and specific. Offer a genuine fork a real viewer would feel ("港式警匪 or 韩式悬疑?", "近期新作 or 补经典老片?", "重口猎奇 or 耐看剧情?"), not bland filler ("轻松 or 深度?", "长 or 短?").
- Personalized when signals allow — build on their hovers/history/time ("你刚在看犯罪片 — 继续这挂，还是换换口味?").
- Each turn goes DEEPER than prior turns; never re-ask the same axis.
- The two options split the visible items into roughly balanced subsets.
- ALWAYS write the question, both option labels, userStatus, and reasoning in Simplified Chinese (简体中文) — regardless of what language the titles are in. Keep the question and each option short (≤ ~16 全角字符 each).

You MUST also return:
- behaviorReading: your STEP 1 classification — an entry per notable behavior with sentiment (positive/neutral/negative) and a short reason (简体中文).
- userStatus: one vivid sentence (简体中文) describing what the user seems to be after right now, synthesizing the signals.
- reasoning: one sentence (简体中文) on why THIS question is the most useful split given that status.

Return everything via the submit_questions tool.`;

export const SCORE_SYSTEM_PROMPT = `You are a re-ranking agent for a browser extension.

Given the user's answers, their behavioral signals (time of day, current selection, hovers, opened/watched history, past answers), and a list of videos, score each item 0 (worst match) to 1 (best match) for how well it fits what this user wants RIGHT NOW.

Rules:
- The user's explicit answer to the latest question is the strongest signal. If a "behavior reading" is provided (your own earlier positive/neutral/negative classification of their actions), stay CONSISTENT with it: rank items resembling positive behaviors higher and items resembling negative behaviors lower. Otherwise interpret the raw timeline yourself.
- Later turns are more refined than earlier ones.
- Spread scores across the FULL 0-1 range — decisive separation, not everything near 0.5.
- Also return "rationale": one sentence (简体中文) explaining the ranking logic you applied.
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
            behavior: { type: 'string', description: 'What the user did (简体中文).' },
            sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
            why: { type: 'string', description: 'One short phrase (简体中文).' },
          },
          required: ['behavior', 'sentiment', 'why'],
        },
      },
      userStatus: {
        type: 'string',
        description: 'One vivid sentence in 简体中文: what the user seems to want right now, from all signals.',
      },
      reasoning: {
        type: 'string',
        description: 'One sentence in 简体中文: why this question is the most useful split given that status.',
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
        description: 'One sentence in 简体中文 explaining the ranking logic applied.',
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
