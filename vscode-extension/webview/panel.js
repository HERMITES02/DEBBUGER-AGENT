// ── VS Code API bridge ────────────────────────────────────────────────────
// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();

// ── Agent pipeline metadata (mirrors AgentFlowChart.tsx) ─────────────────
const AGENT_META = {
  router:                { label: 'Input Router',  color: '#569cd6' },
  code_analysis_agent:   { label: 'Code Analysis', color: '#4ec9b0' },
  context_builder_agent: { label: 'Context',       color: '#9cdcfe' },
  search:                { label: 'Search',        color: '#d7ba7d' },
  analyse:               { label: 'Analyse',       color: '#c586c0' },
  patch:                 { label: 'Patch',         color: '#98c379' },
  patch_agent:           { label: 'Patch',         color: '#98c379' },
  test:                  { label: 'Test Agent',    color: '#f14c4c' },
  test_agent:            { label: 'Test Agent',    color: '#f14c4c' },
};

const PIPELINE = [
  'router',
  'code_analysis_agent',
  'context_builder_agent',
  'search',
  'analyse',
  'patch',
  'test',
];

// ── App state ─────────────────────────────────────────────────────────────
let state = {
  events: [],       // AgentEvent[]
  result: null,     // DebugResult | null
  patchedCode: '',  // final patched code for Apply button
  currentCode: '',  // code snippet being debugged
  language: 'python',
};

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const screens = {
  idle:    $('state-idle'),
  running: $('state-running'),
  error:   $('state-error'),
  result:  $('state-result'),
};

// ── Flowchart initialisation ──────────────────────────────────────────────
function initFlowchart() {
  const container = $('pipeline-nodes');
  container.innerHTML = '';

  PIPELINE.forEach((agentId, index) => {
    const meta = AGENT_META[agentId];
    if (!meta) return;
    const isLast = index === PIPELINE.length - 1;

    const wrapper = document.createElement('div');
    wrapper.className = 'node-wrapper';
    wrapper.id = `node-${agentId}`;

    wrapper.innerHTML = `
      <div class="node-card" id="card-${agentId}" style="border-color: #3e3e42;">
        <span class="node-label" style="color:${meta.color}">${meta.label}</span>
        <span class="node-status-icon" id="icon-${agentId}" style="color:#3e3e42">○</span>
      </div>
      ${!isLast ? `
        <div class="node-connector">
          <div class="connector-v"></div>
          <div class="arrow-down">↓</div>
          <div class="connector-v"></div>
        </div>` : ''}
    `;

    container.appendChild(wrapper);
  });
}

// ── Update a single node's visual status ─────────────────────────────────
function updateNode(agentId, status) {
  // Normalise aliased IDs
  const canonical = agentId === 'patch_agent' ? 'patch'
                  : agentId === 'test_agent'  ? 'test'
                  : agentId;

  const wrapper = $(`node-${canonical}`);
  const card    = $(`card-${canonical}`);
  const icon    = $(`icon-${canonical}`);

  if (!wrapper || !card || !icon) return;

  const meta = AGENT_META[canonical] || AGENT_META[agentId];
  if (!meta) return;

  wrapper.classList.add('visible');
  card.className = `node-card ${status}`;

  if (status === 'running') {
    card.style.borderColor = '#e5c07b';
    icon.innerHTML = '⟳';
    icon.className = 'node-status-icon spinning';
    icon.style.color = '#e5c07b';
  } else if (status === 'done') {
    card.style.borderColor = '#98c379';
    icon.innerHTML = '✓';
    icon.className = 'node-status-icon';
    icon.style.color = '#98c379';
  } else {
    card.style.borderColor = '#3e3e42';
    icon.innerHTML = '○';
    icon.className = 'node-status-icon';
    icon.style.color = '#3e3e42';
  }
}

// ── Derive node status from accumulated events ────────────────────────────
function getNodeStatus(agentId) {
  const evs = state.events.filter((e) => e.agent_id === agentId || e.agent_id === agentId + '_agent');
  if (evs.some((e) => e.type === 'result'))   return 'done';
  if (evs.some((e) => e.type === 'thinking')) return 'running';
  return 'pending';
}

// ── Re-render all nodes from current state ────────────────────────────────
function renderFlowchart() {
  PIPELINE.forEach((agentId) => {
    const status = getNodeStatus(agentId);
    updateNode(agentId, status);
  });

  // Check if all pipeline agents are done
  const allDone = PIPELINE.every((id) => getNodeStatus(id) === 'done');
  const doneEl = $('pipeline-done');
  if (allDone) {
    doneEl.classList.remove('hidden');
  } else {
    doneEl.classList.add('hidden');
  }
}

// ── Handle a new agent event ───────────────────────────────────────────────
function handleAgentEvent(event) {
  state.events.push(event);
  renderFlowchart();
}

// ── Show state screen ─────────────────────────────────────────────────────
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (!el) return;
    if (key === name) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

// ── Set status badge ──────────────────────────────────────────────────────
function setStatus(type, text) {
  const badge = document.querySelector('.status-badge');
  const label = $('status-text');
  if (!badge || !label) return;
  badge.className = `status-badge ${type}`;
  label.textContent = text;
}

// ── Render debug result ───────────────────────────────────────────────────
function renderResult(result) {
  // Confidence
  const conf    = typeof result.confidence === 'number' ? result.confidence : null;
  const confPct = $('conf-pct');
  const confBar = $('conf-bar');

  if (conf !== null) {
    const pct = Math.round(conf * 100);
    confPct.textContent = `${pct}%`;
    confPct.style.color = conf >= 0.75 ? '#98c379' : conf >= 0.5 ? '#e5c07b' : '#f14c4c';
    confBar.style.width = `${pct}%`;
    confBar.style.background =
      conf >= 0.75 ? 'linear-gradient(90deg, #4ec9b0, #98c379)' :
      conf >= 0.5  ? 'linear-gradient(90deg, #e5c07b, #d7ba7d)' :
                     'linear-gradient(90deg, #f14c4c, #e5c07b)';
  } else {
    confPct.textContent = '—';
    confBar.style.width = '0%';
  }

  // Root cause — strip metadata tags
  const rawCause = result.root_cause || '';
  const cleanCause = rawCause
    .replace('ROOT_CAUSE:', '')
    .replace(/CONFIDENCE:[\s\S]*$/, '')
    .replace(/NEEDS_MORE_INFO:[\s\S]*$/, '')
    .replace(/FIX_APPROACH:[\s\S]*$/, '')
    .trim();

  const rcCard = $('card-root-cause');
  const rcText = $('root-cause-text');
  if (cleanCause) {
    rcText.textContent = cleanCause;
    rcCard.style.display = '';
  } else {
    rcCard.style.display = 'none';
  }

  // Explanation
  const exCard = $('card-explanation');
  const exText = $('explanation-text');
  const explanation = result.explanation || '';
  if (explanation) {
    exText.textContent = explanation;
    exCard.style.display = '';
  } else {
    exCard.style.display = 'none';
  }

  // Patch diff
  const patchCard = $('card-patch');
  const patchDiff = $('patch-diff');
  const patch = result.patch_diff || result.patch || '';
  if (patch) {
    renderDiff(patchDiff, patch);
    patchCard.style.display = '';

    // Store patched code for Apply button
    state.patchedCode = applyDiffToCode(state.currentCode, patch);
  } else {
    patchCard.style.display = 'none';
  }

  // Tests
  const testsCard = $('card-tests');
  const testsCode = $('tests-code');
  const tests = Array.isArray(result.tests) ? result.tests.join('\n\n') : (result.tests || '');
  if (tests) {
    testsCode.textContent = tests;
    testsCard.style.display = '';
  } else {
    testsCard.style.display = 'none';
  }

  showScreen('result');
  setStatus('done', 'done');
}

// ── Render a diff string with colour-coded lines ──────────────────────────
function renderDiff(el, diffText) {
  el.innerHTML = '';
  const lines = diffText.split('\n');

  lines.forEach((line) => {
    const span = document.createElement('span');
    if (line.startsWith('+') && !line.startsWith('+++')) {
      span.className = 'diff-add';
      span.textContent = line;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      span.className = 'diff-remove';
      span.textContent = line;
    } else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
      span.className = 'diff-meta';
      span.textContent = line;
    } else {
      span.textContent = line;
    }
    el.appendChild(span);
    el.appendChild(document.createTextNode('\n'));
  });
}

// ── Naive patch application (best-effort for display purposes) ────────────
function applyDiffToCode(original, diff) {
  if (!original || !diff) return original;
  const lines = original.split('\n');
  const result = [...lines];

  diff.split('\n').forEach((line) => {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) return;
    if (line.startsWith('+')) {
      result.push(line.slice(1));
    } else if (line.startsWith('-')) {
      const target = line.slice(1);
      const idx = result.indexOf(target);
      if (idx !== -1) result.splice(idx, 1);
    }
  });

  return result.join('\n');
}

// ── Button actions ────────────────────────────────────────────────────────
function applyPatch() {
  const patch = $('patch-diff').textContent || '';
  vscode.postMessage({
    type: 'applyPatch',
    patch,
    originalCode: state.currentCode,
  });
}

function copyPatch() {
  const text = $('patch-diff').textContent || '';
  vscode.postMessage({ type: 'copyToClipboard', text });
}

function copyTests() {
  const text = $('tests-code').textContent || '';
  vscode.postMessage({ type: 'copyToClipboard', text });
}

function resetToIdle() {
  state.events  = [];
  state.result  = null;
  state.patchedCode = '';
  initFlowchart();
  showScreen('idle');
  setStatus('idle', 'idle');
  $('pipeline-done').classList.add('hidden');
}

// ── Message handler from extension host ───────────────────────────────────
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {

    case 'start': {
      // Reset state for new session
      state.events      = [];
      state.result      = null;
      state.patchedCode = '';
      state.currentCode = msg.codeSnippet || '';
      state.language    = msg.language    || 'python';

      // Show running screen
      initFlowchart();
      showScreen('running');
      setStatus('running', 'running');

      $('pipeline-done').classList.add('hidden');
      $('running-status').textContent = 'Connecting to agent pipeline…';

      // Show code snippet preview
      const preview = $('code-preview');
      if (preview) {
        preview.textContent = state.currentCode.slice(0, 500) +
          (state.currentCode.length > 500 ? '\n…' : '');
      }
      break;
    }

    case 'status': {
      const runningLabel = $('running-status');
      if (runningLabel) runningLabel.textContent = msg.text || '';
      break;
    }

    case 'agentEvent': {
      if (msg.data) handleAgentEvent(msg.data);
      break;
    }

    case 'result': {
      state.result = msg.data;
      renderResult(msg.data);
      break;
    }

    case 'error': {
      const errMsg = $('error-message');
      if (errMsg) errMsg.textContent = msg.message || 'Unknown error';
      showScreen('error');
      setStatus('error', 'error');
      break;
    }
  }
});

// ── Initialise on load ────────────────────────────────────────────────────
initFlowchart();
showScreen('idle');
setStatus('idle', 'idle');
