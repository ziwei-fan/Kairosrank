import { startRerank } from '../src/rerank/flow';

export default defineContentScript({
  matches: [
    '*://*.iyf.tv/*',
    '*://*.iyf.com/*',
    // Research / ML discovery sites
    '*://*.arxiv.org/*',
    '*://arxiv.org/*',
    '*://*.huggingface.co/*',
    '*://news.ycombinator.com/*',
    '*://*.paperswithcode.co/*',
  ],
  runAt: 'document_idle',
  main(ctx) {
    startRerank(ctx);
  },
});
