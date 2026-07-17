import type { Sample, Question, Answer, PriorTurn } from '../messages';
import type { QuestionResult, ScoreResult } from './anthropic';

const ZH_TURNS: { text: string; options: [string, string] }[] = [
  { text: '你想看轻松的还是深度的?', options: ['轻松娱乐', '深度剧情'] },
  { text: '偏好新作还是经典?', options: ['新作', '经典'] },
  { text: '中国制作还是海外制作?', options: ['中国', '海外'] },
  { text: '强情节还是治愈系?', options: ['强情节', '治愈系'] },
  { text: '短剧还是长剧?', options: ['短(<20集)', '长(>20集)'] },
];

export async function mockQuestions(_samples: Sample[], priorTurns: PriorTurn[]): Promise<QuestionResult> {
  await new Promise((r) => setTimeout(r, 300));
  const idx = Math.min(priorTurns.length, ZH_TURNS.length - 1);
  const t = ZH_TURNS[idx];
  return {
    questions: [
      {
        id: `q${idx + 1}`,
        text: t.text,
        options: [
          { id: 'a', label: t.options[0] },
          { id: 'b', label: t.options[1] },
        ],
      },
    ],
    userStatus: '(\u6a21\u62df) \u6b63\u5728\u968f\u4fbf\u901b\u901b\uff0c\u8fd8\u6ca1\u660e\u786e\u76ee\u6807\u3002',
    reasoning: '(\u6a21\u62df) \u8fd9\u662f\u5f00\u53d1\u6a21\u5f0f\u7684\u56fa\u5b9a\u95ee\u9898\u3002',
    behaviorReading: [
      { behavior: '(\u6a21\u62df) \u6d4f\u89c8\u4e86\u5217\u8868', sentiment: 'neutral', why: '\u5f00\u53d1\u6a21\u5f0f\u5360\u4f4d' },
    ],
  };
}

export async function mockScores(
  _questions: Question[],
  answers: Answer[],
  items: Sample[],
): Promise<ScoreResult> {
  await new Promise((r) => setTimeout(r, 400));
  const scores: Record<string, number> = {};
  const seed = answers.map((a) => a.optionId).join('');
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;

  for (const it of items) {
    let x = h;
    for (let i = 0; i < it.id.length; i++) x = (x * 31 + it.id.charCodeAt(i)) | 0;
    scores[it.id] = ((x >>> 0) % 1000) / 1000;
  }
  return { scores, rationale: '(模拟) 开发模式的确定性伪随机打分。' };
}
