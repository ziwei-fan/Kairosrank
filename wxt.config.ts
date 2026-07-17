import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  outDir: 'dist',
  manifest: {
    name: 'Kairosrank (JIT Re-Rank)',
    description: 'Learn your taste on-device and silently re-rank lists in place — arXiv, Hugging Face, Hacker News, Papers with Code, and iyf.tv.',
    version: '0.4.0',
    permissions: ['storage', 'offscreen'],
    host_permissions: [
      '*://*.iyf.tv/*',
      '*://*.iyf.com/*',
      // Research / ML discovery sites
      '*://*.arxiv.org/*',
      '*://arxiv.org/*',
      '*://*.huggingface.co/*',
      '*://news.ycombinator.com/*',
      '*://*.paperswithcode.co/*',
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
    ],
    // WASM (onnxruntime) needs wasm-unsafe-eval; model+wasm are bundled resources.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    web_accessible_resources: [{ resources: ['models/*', 'ort/*'], matches: ['<all_urls>'] }],
  },
});
