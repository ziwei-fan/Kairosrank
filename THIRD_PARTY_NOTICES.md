# Third-Party Notices & Attribution — JIT Re-Rank

This project incorporates third-party software and models. This file lists them, their
licenses, and the required attributions. It is organized by whether a component is
**redistributed in the shipped extension** (strongest obligations) versus **used only
for development/evaluation** (relevant for a source release).

> **Before releasing:** ship this file plus `NOTICE`, and include the **full license
> texts** of the components below (they are present in each package's own `LICENSE`
> file under `node_modules/`, and in the model repositories on Hugging Face). For the
> project's *own* license, see [§ 5](#5-the-projects-own-license--gated-on-ip-clearance).

---

## 1. Bundled in the shipped extension (redistributed to end users)

These are packaged into the extension artifact (`dist/`) and therefore redistributed.

### 1.1 Transformers.js — `@huggingface/transformers`
- **License:** Apache License 2.0
- **Copyright:** © Hugging Face, Inc.
- **Use:** the inference library that runs the embedding model in the offscreen document; its code is bundled into the built JavaScript.
- **Requirement:** include the Apache-2.0 license text and any upstream `NOTICE`. Source: <https://github.com/huggingface/transformers.js>.

### 1.2 ONNX Runtime Web — `onnxruntime-web` / `onnxruntime-common`
- **License:** MIT License
- **Copyright:** © Microsoft Corporation
- **Use:** the WebAssembly runtime executing the ONNX model (`public/ort/ort-wasm-simd-threaded[.asyncify].{mjs,wasm}`).
- **Requirement:** include the MIT license text and copyright notice (reproduced in [§ 4](#4-full-license-texts)). Source: <https://github.com/microsoft/onnxruntime>.

### 1.3 Embedding model — `paraphrase-multilingual-MiniLM-L12-v2`
- **License:** Apache License 2.0
- **Attribution:** original model by **sentence-transformers** (UKP Lab, TU Darmstadt / Hugging Face); ONNX conversion published by **Xenova** (Hugging Face).
- **Use:** bundled at `public/models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/` (weights + tokenizer); provides on-device multilingual embeddings for the silent re-rank.
- **Requirement:** retain the Apache-2.0 license and attribute the original authors.
- Base model: <https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2> · ONNX: <https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2>

---

## 2. Development & build dependencies (not in the shipped binary)

Relevant for a **source** release. Not redistributed in the packaged extension, but
present in the repository / build toolchain.

| Package | License |
|---|---|
| WXT (`wxt`) | MIT |
| Vite (`vite`, via WXT) | MIT |
| TypeScript (`typescript`) | Apache-2.0 |
| Vitest (`vitest`) | MIT |
| Playwright (`playwright`) | Apache-2.0 |
| happy-dom (`happy-dom`) | MIT |
| `@types/chrome` | MIT (DefinitelyTyped) |

---

## 3. Referenced but NOT bundled (evaluation-only)

The following models are downloaded **at runtime from Hugging Face by local evaluation
scripts only** (`scripts/small-llm-bench.mjs`, `scripts/qwen-qgen-test.mjs`). They are
**not** included in the repository or the shipped extension, so their redistribution
terms do not currently apply.

| Model (repo) | License | Note |
|---|---|---|
| Qwen2.5-0.5B / 1.5B-Instruct, Qwen3-0.6B (`onnx-community/*`) | Apache-2.0 (verify per size) | evaluated, not shipped |
| Llama-3.2-1B-Instruct (`onnx-community/*`) | **Meta Llama 3.2 Community License (restricted)** | evaluated, not shipped |
| gemma-3-1b-it (`onnx-community/*`) | **Gemma Terms of Use (restricted)** | evaluated, not shipped |
| SmolLM2-1.7B-Instruct (`HuggingFaceTB/*`) | Apache-2.0 | evaluated, not shipped |

> **Caution:** if any of these is ever **bundled/redistributed** (e.g. an on-device
> question-gen model), its license must be complied with first. **Llama-3.2** and
> **gemma-3** carry use restrictions and attribution/naming requirements that are *not*
> standard open source — do not bundle them without meeting those terms.

---

## 4. Full license texts

**MIT License** (applies to ONNX Runtime Web © Microsoft Corporation, and the MIT-licensed dev tools above):

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Apache License 2.0** (applies to Transformers.js © Hugging Face, the MiniLM model, TypeScript, Playwright): full text at <https://www.apache.org/licenses/LICENSE-2.0>. A release must include the complete `LICENSE` and any `NOTICE` shipped with these components (found under `node_modules/@huggingface/transformers/` and the model repositories).

---

## 5. The project's own license — GATED on IP clearance

A project needs its own license, but **applying one asserts you have the right to
license the code** — which loops back to the unresolved ownership question in
`ip_provenance_and_inventorship.md`. **Do not finalize a `LICENSE` file or a copyright
line until that is cleared.**

When you are cleared to license it:
- **MIT** is the simplest permissive choice for a prototype (recommended default).
- **Apache-2.0** adds an explicit patent grant — but that means *granting a patent
  license you may not own*; given the ownership uncertainty, prefer MIT (no patent
  grant) unless counsel advises otherwise.

MIT template to use once cleared (fill the copyright line per counsel's guidance):

```
MIT License

Copyright (c) 2026 <COPYRIGHT HOLDER — see ip_provenance_and_inventorship.md>

Permission is hereby granted, free of charge, to any person obtaining a copy
... (standard MIT text as reproduced in § 4) ...
```

---

## 6. Academic attribution

The project's concept ("just-in-time information recommendation") is adapted from the
following publicly published paper. **Only the concept was used — no code or data from
the paper was incorporated.** It must be cited in any report or publication.

> Ke Yang, Kevin Ros, Shankar Kumar Senthil Kumar, ChengXiang Zhai.
> *JIR-Arena: The First Benchmark Dataset for Just-in-time Information Recommendation.*
> arXiv:2505.13550, 2025. <https://arxiv.org/abs/2505.13550>

BibTeX:

```bibtex
@article{yang2025jirarena,
  title   = {JIR-Arena: The First Benchmark Dataset for Just-in-time Information Recommendation},
  author  = {Yang, Ke and Ros, Kevin and Senthil Kumar, Shankar Kumar and Zhai, ChengXiang},
  journal = {arXiv preprint arXiv:2505.13550},
  year    = {2025},
  url     = {https://arxiv.org/abs/2505.13550}
}
```
