import type { Question, Answer, BehaviorReading } from '../messages';

export interface PanelOptions {
  siteLabel: string;
  onUndo(): void;
  onAskAnother(): void;
  onForget(): void;
  onToggleAuto(on: boolean): void;
  onToggleProactive(on: boolean): void;
  onToggleHideSeen(on: boolean): void; // hide items already opened
  onOpen(): void; // user clicked the pill
  onCollapse(): void; // user collapsed to the pill
}

export interface PanelHandle {
  status(text: string, tone?: 'info' | 'error'): void;
  showCards(count: number): void;
  setMemory(clicks: number, answers: number): void;
  showStatus(userStatus?: string, reasoning?: string): void;
  showRationale(rationale?: string): void;
  showRanked(rows: { title: string; score: number }[]): void;
  setAuto(on: boolean): void;
  setProactive(on: boolean): void;
  setHideSeen(on: boolean): void;
  showReading(reading?: BehaviorReading[]): void;
  resetForNav(): void;
  offerHelp(text: string): Promise<'yes' | 'no' | 'dismiss'>;
  askQuestion(q: Question): Promise<Answer>;
  setPostRerank(): void;
  expand(): void;
  collapse(): void;
  setPillHint(on: boolean): void;
  setPillLabel(text: string): void;
  destroy(): void;
}

const HOST_ID = '__jit_rerank_host__';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function mountPanel(opts: PanelOptions): PanelHandle {
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'position:fixed!important;top:16px!important;right:16px!important;z-index:2147483647!important;' +
    'width:auto!important;height:auto!important;margin:0!important;padding:0!important';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host, * { box-sizing:border-box; }
      /* Collapsed = a small unobtrusive pill. Expanded = the full panel. */
      .wrap.collapsed .panel { display:none; }
      .wrap:not(.collapsed) .pill { display:none; }
      .pill {
        font: 13px -apple-system, system-ui, sans-serif;
        display:flex; align-items:center; gap:6px;
        background: rgba(18,18,20,0.9); color:#f5f5f5; cursor:pointer;
        border:1px solid rgba(255,255,255,0.12); border-radius:999px;
        padding:7px 12px; box-shadow:0 6px 20px rgba(0,0,0,0.35);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        opacity:0.55; transition:opacity .2s, box-shadow .2s, transform .2s;
      }
      .pill:hover { opacity:1; }
      .pill .dot { width:7px; height:7px; border-radius:50%; background:#3b82f6; }
      .pill .lbl { font-size:11px; font-weight:600; letter-spacing:0.03em; }
      .pill.hint {
        opacity:1; box-shadow:0 0 0 3px rgba(59,130,246,0.35), 0 6px 20px rgba(0,0,0,0.4);
        animation: jitpulse 1.6s ease-in-out infinite;
      }
      @keyframes jitpulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
      .panel {
        font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        width: 300px; background: rgba(18,18,20,0.95); color:#f5f5f5;
        border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px;
        box-shadow:0 12px 32px rgba(0,0,0,0.4);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      }
      .row { display:flex; align-items:center; justify-content:space-between; }
      .title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; opacity:0.75; }
      .badge { font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.12); }
      .mem { font-size:10px; opacity:0.7; cursor:default; }
      .mem b { opacity:0.95; }
      .forget { font-size:10px; opacity:0.5; cursor:pointer; margin-left:6px; }
      .forget:hover { opacity:0.9; text-decoration:underline; }
      .status { font-size:12px; opacity:0.85; margin:8px 0; }
      .status.error { color:#fca5a5; }
      .reason { margin:8px 0; display:none; }
      .reason.show { display:block; }
      .reason .who {
        font-size:13px; line-height:1.4; color:#dbeafe;
        background:rgba(59,130,246,0.12); border-left:2px solid #3b82f6;
        border-radius:6px; padding:7px 9px;
      }
      .reason .who b { font-weight:600; opacity:0.6; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; display:block; margin-bottom:2px; }
      .reason .why { font-size:11px; opacity:0.6; font-style:italic; margin-top:5px; padding-left:2px; line-height:1.4; }
      .reading { margin:8px 0; display:none; }
      .reading.show { display:block; }
      .reading .rh { font-size:10px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; opacity:0.5; margin-bottom:4px; }
      .reading .ri { display:flex; align-items:flex-start; gap:6px; font-size:11.5px; line-height:1.35; padding:2px 0; }
      .reading .sent { flex:0 0 auto; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px; margin-top:1px; }
      .reading .sent.positive { background:rgba(16,185,129,0.2); color:#6ee7b7; }
      .reading .sent.negative { background:rgba(244,114,114,0.2); color:#fca5a5; }
      .reading .sent.neutral { background:rgba(255,255,255,0.1); color:#d4d4d8; }
      .reading .rb { flex:1; }
      .reading .rw { opacity:0.55; }
      .ranked { margin-top:10px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; }
      .ranked > summary {
        cursor:pointer; list-style:none; font-size:11px; font-weight:600;
        letter-spacing:0.04em; opacity:0.7; user-select:none; display:flex; align-items:center; gap:5px;
      }
      .ranked > summary::-webkit-details-marker { display:none; }
      .ranked > summary::before { content:'▸'; font-size:9px; transition:transform .15s; }
      .ranked[open] > summary::before { transform:rotate(90deg); display:inline-block; }
      .ranked-list {
        list-style:none; margin:6px 0 0; padding:0; counter-reset:rk;
        max-height:240px; overflow-y:auto; font-size:12px;
      }
      .ranked-list li {
        counter-increment:rk; display:flex; align-items:center; gap:8px;
        padding:3px 4px; border-radius:4px; line-height:1.3;
      }
      .ranked-list li:nth-child(odd) { background:rgba(255,255,255,0.03); }
      .ranked-list li::before {
        content:counter(rk); flex:0 0 20px; text-align:right;
        opacity:0.4; font-variant-numeric:tabular-nums; font-size:10px;
      }
      .ranked-list .t { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ranked-list .s {
        flex:0 0 auto; font-size:10px; font-variant-numeric:tabular-nums;
        padding:1px 5px; border-radius:3px; background:rgba(255,255,255,0.08);
      }
      .ranked-list .s.hi { background:rgba(16,185,129,0.22); color:#6ee7b7; }
      .ranked-list .s.lo { opacity:0.5; }
      .q { margin:10px 0; display:flex; flex-direction:column; gap:8px; }
      .q-text { font-size:14px; font-weight:500; line-height:1.4; }
      .q-opts { display:flex; gap:6px; }
      .q-opts button { flex:1; padding:10px; font-weight:500; }
      .actions { display:flex; gap:6px; }
      button {
        flex:1; padding:7px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.15);
        background:rgba(255,255,255,0.08); color:inherit; font:inherit; cursor:pointer; transition:background .15s;
      }
      button:hover:not(:disabled) { background:rgba(255,255,255,0.18); }
      button:disabled { opacity:0.4; cursor:not-allowed; }
      button.primary { background:#3b82f6; border-color:#3b82f6; }
      button.primary:hover:not(:disabled) { background:#2563eb; }
      .close { flex:0 0 auto; padding:4px 8px; background:transparent; border-color:transparent; opacity:0.6; font-size:14px; }
      .close:hover { opacity:1; background:rgba(255,255,255,0.08); }
    </style>
    <div class="wrap collapsed" id="wrap">
    <button class="pill" id="pill" title="Kairosrank (JIT Re-Rank) — click to re-rank this page">
      <span class="dot"></span><span class="lbl" id="pill-lbl">re-rank</span>
    </button>
    <div class="panel">
      <div class="row">
        <span class="title">Kairosrank (JIT Re-Rank)</span>
        <span class="badge" id="site"></span>
      </div>
      <div class="row" style="margin-top:6px">
        <span class="mem" id="mem" title="Remembered locally; fed into scoring">🧠 memory: empty</span>
        <span class="forget" id="forget" title="Clear this site's memory">forget</span>
      </div>
      <div class="row" style="margin-top:4px">
        <span class="mem" id="auto" title="Offer a re-rank when the monitor thinks you're stuck">⚡ auto-suggest: on</span>
        <span class="mem" id="proactive" title="Auto-open and ask as soon as a page loads">🚀 on arrival: off</span>
      </div>
      <div class="row" style="margin-top:4px">
        <span class="mem" id="hideseen" title="Hide items you've already opened on this site">🙈 hide seen: off</span>
        <span class="mem" id="mlt-hint" title="Hold Option/Alt and click any item to rank the list by similarity to it">≈ ⌥-click: more like this</span>
      </div>
      <div class="status" id="status"></div>
      <div class="reading" id="reading"></div>
      <div class="reason" id="reason"></div>
      <div id="qbox"></div>
      <div class="actions">
        <button id="ask">Ask another</button>
        <button id="undo" disabled>Undo</button>
        <button class="close" id="close" title="Hide">×</button>
      </div>
      <details class="ranked" id="ranked" hidden>
        <summary id="ranked-sum">Ranked items</summary>
        <ol class="ranked-list" id="ranked-list"></ol>
      </details>
    </div>
    </div>
  `;

  const $ = (id: string) => shadow.getElementById(id) as HTMLElement;
  $('site').textContent = opts.siteLabel;
  $('ask').addEventListener('click', () => opts.onAskAnother());
  $('undo').addEventListener('click', () => opts.onUndo());
  $('forget').addEventListener('click', () => opts.onForget());
  // × collapses back to the pill (stays available); it no longer tears down.
  $('close').addEventListener('click', () => {
    $('wrap').classList.add('collapsed');
    opts.onCollapse();
  });
  // Clicking the pill is the manual "ask" entry point.
  $('pill').addEventListener('click', () => {
    $('pill').classList.remove('hint');
    $('wrap').classList.remove('collapsed');
    opts.onOpen();
  });

  let autoOn = true;
  $('auto').style.cursor = 'pointer';
  $('auto').addEventListener('click', () => {
    autoOn = !autoOn;
    $('auto').innerHTML = `⚡ auto-suggest: ${autoOn ? 'on' : 'off'}`;
    opts.onToggleAuto(autoOn);
  });

  let proactiveOn = false;
  $('proactive').style.cursor = 'pointer';
  $('proactive').addEventListener('click', () => {
    proactiveOn = !proactiveOn;
    $('proactive').innerHTML = `🚀 on arrival: ${proactiveOn ? 'on' : 'off'}`;
    opts.onToggleProactive(proactiveOn);
  });

  let hideSeenOn = false;
  $('hideseen').style.cursor = 'pointer';
  $('hideseen').addEventListener('click', () => {
    hideSeenOn = !hideSeenOn;
    $('hideseen').innerHTML = `🙈 hide seen: ${hideSeenOn ? 'on' : 'off'}`;
    opts.onToggleHideSeen(hideSeenOn);
  });

  return {
    status(text, tone = 'info') {
      const el = $('status');
      el.textContent = text;
      el.className = `status ${tone}`;
    },
    showCards(count) {
      this.status(`${count} items detected.`);
    },
    setMemory(clicks, answers) {
      $('mem').innerHTML =
        clicks === 0 && answers === 0
          ? '🧠 memory: empty'
          : `🧠 memory: <b>${clicks}</b> opened · <b>${answers}</b> answers`;
    },
    showStatus(userStatus, reasoning) {
      const el = $('reason');
      if (!userStatus && !reasoning) {
        el.classList.remove('show');
        el.innerHTML = '';
        return;
      }
      el.innerHTML =
        (userStatus ? `<div class="who"><b>💭 read on you</b>${esc(userStatus)}</div>` : '') +
        (reasoning ? `<div class="why">why this question: ${esc(reasoning)}</div>` : '');
      el.classList.add('show');
    },
    showRationale(rationale) {
      if (!rationale) return;
      const el = $('reason');
      el.innerHTML = `<div class="why">↕ ranked because: ${esc(rationale)}</div>`;
      el.classList.add('show');
    },
    setAuto(on) {
      autoOn = on;
      $('auto').innerHTML = `⚡ auto-suggest: ${on ? 'on' : 'off'}`;
    },
    setProactive(on) {
      proactiveOn = on;
      $('proactive').innerHTML = `🚀 on arrival: ${on ? 'on' : 'off'}`;
    },
    setHideSeen(on) {
      hideSeenOn = on;
      $('hideseen').innerHTML = `🙈 hide seen: ${on ? 'on' : 'off'}`;
    },
    showReading(reading) {
      const el = $('reading');
      if (!reading || reading.length === 0) {
        el.classList.remove('show');
        el.innerHTML = '';
        return;
      }
      el.innerHTML =
        `<div class="rh">🔎 read on your actions</div>` +
        reading
          .map(
            (r) =>
              `<div class="ri"><span class="sent ${r.sentiment}">${r.sentiment === 'positive' ? '＋' : r.sentiment === 'negative' ? '－' : '◦'}</span>` +
              `<span class="rb">${esc(r.behavior)} <span class="rw">— ${esc(r.why)}</span></span></div>`,
          )
          .join('');
      el.classList.add('show');
    },
    resetForNav() {
      $('qbox').innerHTML = '';
      $('status').textContent = '';
      $('reading').classList.remove('show');
      $('reading').innerHTML = '';
      const r = $('reason');
      r.classList.remove('show');
      r.innerHTML = '';
      $('ranked').setAttribute('hidden', '');
      ($('undo') as HTMLButtonElement).disabled = true;
      $('pill').classList.remove('hint');
      $('wrap').classList.add('collapsed');
    },
    offerHelp(text) {
      return new Promise<'yes' | 'no' | 'dismiss'>((resolve) => {
        const box = $('qbox');
        box.innerHTML =
          `<div class="q"><div class="q-text">${esc(text)}</div><div class="q-opts">` +
          `<button data-v="1" class="primary">Help me ↓</button><button data-v="0">Not now</button>` +
          `</div></div>`;
        let done = false;
        const finish = (v: 'yes' | 'no' | 'dismiss') => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          box.innerHTML = '';
          resolve(v);
        };
        box.querySelectorAll<HTMLButtonElement>('.q-opts button').forEach((b) => {
          b.addEventListener('click', () => finish(b.dataset.v === '1' ? 'yes' : 'no'));
        });
        // Auto-dismiss if ignored — never leave the offer lingering.
        const timer = window.setTimeout(() => finish('dismiss'), 12000);
      });
    },
    showRanked(rows) {
      const box = $('ranked');
      const list = $('ranked-list');
      if (!rows.length) {
        box.setAttribute('hidden', '');
        return;
      }
      $('ranked-sum').textContent = `Ranked items (${rows.length}) — click to expand`;
      list.innerHTML = rows
        .map((r) => {
          const cls = r.score >= 0.66 ? 'hi' : r.score < 0.34 ? 'lo' : '';
          return `<li><span class="t">${esc(r.title || '(no title)')}</span><span class="s ${cls}">${r.score.toFixed(2)}</span></li>`;
        })
        .join('');
      box.removeAttribute('hidden');
    },
    askQuestion(q) {
      return new Promise<Answer>((resolve) => {
        const box = $('qbox');
        box.innerHTML =
          `<div class="q"><div class="q-text">${esc(q.text)}</div><div class="q-opts">` +
          q.options.map((o) => `<button data-oid="${esc(o.id)}">${esc(o.label)}</button>`).join('') +
          `</div></div>`;
        box.querySelectorAll<HTMLButtonElement>('.q-opts button').forEach((btn) => {
          btn.addEventListener('click', () => {
            box.innerHTML = '';
            resolve({ questionId: q.id, optionId: btn.dataset.oid! });
          });
        });
      });
    },
    setPostRerank() {
      ($('undo') as HTMLButtonElement).disabled = false;
    },
    expand() {
      $('pill').classList.remove('hint');
      $('wrap').classList.remove('collapsed');
    },
    collapse() {
      $('wrap').classList.add('collapsed');
    },
    setPillHint(on) {
      $('pill').classList.toggle('hint', on);
    },
    setPillLabel(text) {
      $('pill-lbl').textContent = text;
    },
    destroy() {
      host.remove();
    },
  };
}
