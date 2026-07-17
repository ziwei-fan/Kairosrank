import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateQuestions, scoreItems } from './openai';

let calls: { url: string; opts: { headers: Record<string, string>; body: string } }[] = [];
const origFetch = globalThis.fetch;

function stubFetch(toolArgs: unknown, ok = true) {
  globalThis.fetch = (async (url: string, opts: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, opts });
    return {
      ok,
      json: async () =>
        ok
          ? { choices: [{ message: { tool_calls: [{ function: { name: 'x', arguments: JSON.stringify(toolArgs) } }] } }] }
          : { error: { message: 'bad key' } },
    };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = origFetch;
});

describe('openai adapter', () => {
  it('builds a function-calling request and parses questions', async () => {
    stubFetch({
      questions: [{ id: 'q1', text: '想看哪种?', options: [{ id: 'a', label: '悬疑' }, { id: 'b', label: '爱情' }] }],
      userStatus: '想找刺激的',
      reasoning: '这个问题最能区分',
      behaviorReading: [],
    });
    const r = await generateQuestions('sk-test', 'gpt-4o-mini', 'arxiv', [{ id: '1', title: 'T' }]);

    expect(calls.length).toBe(1);
    const { url, opts } = calls[0];
    expect(url).toContain('api.openai.com');
    expect(opts.headers.authorization).toBe('Bearer sk-test');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.tools[0].type).toBe('function');
    expect(body.tools[0].function.name).toBe('submit_questions');
    expect(body.tools[0].function.parameters.type).toBe('object'); // converted from input_schema
    expect(body.tool_choice.function.name).toBe('submit_questions');
    expect(r.questions[0].options.length).toBe(2);
    expect(r.userStatus).toBe('想找刺激的');
  });

  it('maps the model number-keyed scores back to item ids', async () => {
    stubFetch({ rationale: 'r', scores: [{ id: '1', score: 0.9 }, { id: '2', score: 0.1 }] });
    const items = [{ id: 'itemA', title: 'A' }, { id: 'itemB', title: 'B' }];
    const r = await scoreItems(
      'sk-test',
      'gpt-4o-mini',
      [{ id: 'q1', text: '?', options: [{ id: 'a', label: 'X' }, { id: 'b', label: 'Y' }] }],
      [{ questionId: 'q1', optionId: 'a' }],
      items,
    );
    expect(r.scores['itemA']).toBe(0.9);
    expect(r.scores['itemB']).toBeCloseTo(0.1);
  });

  it('surfaces a clear error on API failure', async () => {
    stubFetch({}, false);
    await expect(generateQuestions('bad', 'gpt-4o-mini', 'arxiv', [{ id: '1', title: 'T' }])).rejects.toThrow(
      /OpenAI API error: bad key/,
    );
  });
});
