const THEME_KEY = 'api-test-pages-theme';

function $(id) {
  return document.getElementById(id);
}

function trimSlash(str = '') {
  return String(str).replace(/\/+$/, '');
}

function normalizeBaseUrl(input = '') {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return trimSlash(raw);
  return trimSlash(`https://${raw}`);
}

function joinUrl(baseUrl, path = '') {
  const base = trimSlash(baseUrl || '');
  const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
  return `${base}${suffix}`;
}

function inferProvider(pathMode = 'auto', baseUrl = '') {
  if (pathMode && pathMode !== 'auto') return pathMode;
  const s = String(baseUrl || '').toLowerCase();
  if (s.includes('anthropic') || s.includes('claude')) return 'anthropic';
  return 'openai';
}

function baseHasV1(baseUrl = '') {
  return /\/v1$/i.test(trimSlash(baseUrl));
}

function uniq(list) {
  return [...new Set(list.filter(Boolean))];
}

function candidateModelPaths(provider, baseUrl = '') {
  const hasV1 = baseHasV1(baseUrl);
  if (provider === 'anthropic') return uniq(hasV1 ? ['/models'] : ['/v1/models', '/models']);
  return uniq(hasV1 ? ['/models'] : ['/v1/models', '/models']);
}

function candidateChatPaths(provider, baseUrl = '') {
  const hasV1 = baseHasV1(baseUrl);
  if (provider === 'anthropic') return uniq(hasV1 ? ['/messages'] : ['/v1/messages', '/messages']);
  return uniq(hasV1 ? ['/chat/completions', '/responses'] : ['/v1/chat/completions', '/chat/completions', '/v1/responses', '/responses']);
}

function candidateConnectivityPaths(provider, baseUrl = '') {
  return uniq(['/', ...candidateModelPaths(provider, baseUrl), ...candidateChatPaths(provider, baseUrl)]);
}

function buildHeaders({ provider, apiKey, json = false }) {
  const headers = { accept: 'application/json' };
  if (json) headers['content-type'] = 'application/json';
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (provider === 'anthropic') headers['anthropic-version'] = '2023-06-01';
  return headers;
}

function isResponsesPath(path = '') {
  return /\/responses$/i.test(String(path || ''));
}

function buildChatBody({ provider, model, message, path }) {
  const text = String(message || '').trim() || 'Hello';
  if (provider === 'anthropic') {
    return { model, max_tokens: 512, messages: [{ role: 'user', content: text }] };
  }
  if (isResponsesPath(path)) {
    return { model, input: text, max_output_tokens: 512 };
  }
  return { model, messages: [{ role: 'user', content: text }], max_tokens: 512 };
}

function extractModels(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  return data.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item.id === 'string') return item.id;
    if (item && typeof item.name === 'string') return item.name;
    return null;
  }).filter(Boolean);
}

function extractChatText(provider, payload) {
  if (provider === 'anthropic') {
    const content = Array.isArray(payload?.content) ? payload.content : [];
    const textBlock = content.find((item) => item && item.type === 'text' && typeof item.text === 'string');
    return textBlock?.text || JSON.stringify(payload);
  }
  if (typeof payload?.output_text === 'string' && payload.output_text) return payload.output_text;
  const msg = payload?.choices?.[0]?.message?.content;
  if (typeof msg === 'string') return msg;
  const outputText = payload?.output?.flatMap?.((item) => item?.content || [])?.find?.((x) => x?.type === 'output_text' && typeof x?.text === 'string');
  if (outputText?.text) return outputText.text;
  return JSON.stringify(payload);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  $('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  $('themeToggle').title = theme === 'dark' ? '切换亮色' : '切换暗色';
}

function loadTheme() {
  applyTheme('light');
}

function toggleTheme() {
  const current = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

function setStatus(text, kind = '', hint = '') {
  const el = $('statusBar');
  el.textContent = text;
  el.className = `status-bar ${kind}`.trim();
  $('statusHint').textContent = hint || '';
}

function show(obj) {
  $('result').textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}

function setModels(models) {
  const select = $('modelSelect');
  select.innerHTML = '';
  const list = Array.isArray(models) ? models : [];
  if (!list.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '未获取到模型';
    select.appendChild(opt);
    return;
  }
  for (const model of list) {
    const opt = document.createElement('option');
    opt.value = model;
    opt.textContent = model;
    select.appendChild(opt);
  }
}

function clearEmptyState() {
  const empty = $('chatTimeline').querySelector('.chat-empty');
  if (empty) empty.remove();
}

function ensureEmptyState() {
  const box = $('chatTimeline');
  if (!box.children.length) {
    box.innerHTML = '<div class="chat-empty">先探测模型，再在这里发一条消息试试。</div>';
  }
}

function addBubble(role, text, meta = '', isError = false) {
  clearEmptyState();
  const box = $('chatTimeline');
  const row = document.createElement('div');
  row.className = `bubble-row ${role}${isError ? ' error' : ''}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const metaEl = document.createElement('div');
  metaEl.className = 'bubble-meta';
  metaEl.textContent = meta || (role === 'user' ? '你' : 'API');

  const textEl = document.createElement('div');
  textEl.className = 'bubble-text';
  textEl.textContent = text;

  bubble.appendChild(metaEl);
  bubble.appendChild(textEl);
  row.appendChild(bubble);
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function currentPayload() {
  const baseUrl = normalizeBaseUrl($('baseUrl').value);
  return {
    baseUrl,
    apiKey: $('apiKey').value.trim(),
    mode: $('mode').value,
    manualPath: $('manualPath').value.trim(),
  };
}

function selectedModel() {
  return $('manualModel').value.trim() || $('modelSelect').value || '';
}

function summarizeError(error) {
  const msg = String(error?.message || error || '请求失败');
  if (/failed to fetch/i.test(msg)) {
    return {
      short: '浏览器请求失败',
      hint: '常见原因：CORS 被拦、证书问题、目标接口不可达，或该 API 不允许浏览器直连。',
    };
  }
  return { short: msg, hint: '详细信息已写入 INFO。' };
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { rawText: text };
  }
  return { ok: res.ok, status: res.status, url, json };
}

async function tryConnectivity(baseUrl, provider, apiKey, manualPath) {
  const paths = manualPath ? [manualPath] : candidateConnectivityPaths(provider, baseUrl);
  const attempts = [];
  for (const path of paths) {
    const url = joinUrl(baseUrl, path);
    try {
      const result = await requestJson(url, {
        method: 'GET',
        headers: buildHeaders({ provider, apiKey }),
      });
      attempts.push({ path, status: result.status, ok: result.ok, url, preview: result.json });
      if (result.ok) return { ok: true, attempts };
    } catch (error) {
      attempts.push({ path, ok: false, url, error: String(error.message || error) });
    }
  }
  return { ok: false, attempts };
}

async function tryModels(baseUrl, provider, apiKey, manualPath) {
  if (!apiKey) return { ok: false, attempts: [], models: [] };
  const paths = manualPath ? [manualPath] : candidateModelPaths(provider, baseUrl);
  const attempts = [];
  for (const path of paths) {
    const url = joinUrl(baseUrl, path);
    try {
      const result = await requestJson(url, {
        method: 'GET',
        headers: buildHeaders({ provider, apiKey }),
      });
      const models = extractModels(result.json);
      attempts.push({ path, status: result.status, ok: result.ok, url, count: models.length, preview: result.json });
      if (result.ok && models.length) return { ok: true, attempts, models, path };
    } catch (error) {
      attempts.push({ path, ok: false, url, error: String(error.message || error) });
    }
  }
  return { ok: false, attempts, models: [] };
}

async function probe() {
  const { baseUrl, apiKey, mode, manualPath } = currentPayload();
  if (!baseUrl) {
    setStatus('请先填写 Base URL', 'bad', '例如 https://api.openai.com/v1');
    return;
  }

  const provider = inferProvider(mode, baseUrl);
  setStatus('正在探测…', 'warn', '浏览器将直接请求目标 API。');
  show('正在探测…');
  setModels([]);

  try {
    if (!apiKey) {
      const connectivity = await tryConnectivity(baseUrl, provider, '', manualPath);
      if (connectivity.ok) {
        setStatus('连通性测试成功', 'ok', '未提供 Key，因此只做了基础可达性检查。');
      } else {
        setStatus('连通性测试失败', 'bad', '可能是 CORS、路径错误、服务不可达，或接口不支持浏览器直连。');
      }
      show({ ok: connectivity.ok, provider, mode: 'connectivity', attempts: connectivity.attempts });
      return;
    }

    const modelsResult = await tryModels(baseUrl, provider, apiKey, manualPath);
    if (modelsResult.models.length) setModels(modelsResult.models);

    if (modelsResult.ok) {
      setStatus(`已获取 ${modelsResult.models.length} 个模型`, 'ok', '可直接选模型，也可手动输入模型名覆盖。');
    } else {
      setStatus('未获取到模型', 'warn', '你仍可手动填写模型名继续聊天测试。');
    }

    show({ ok: modelsResult.ok, provider, mode: 'models', path: modelsResult.path || null, models: modelsResult.models, attempts: modelsResult.attempts });
  } catch (error) {
    const info = summarizeError(error);
    setStatus(info.short, 'bad', info.hint);
    show({ ok: false, error: String(error.message || error), hint: info.hint });
  }
}

async function chat() {
  const { baseUrl, apiKey, mode, manualPath } = currentPayload();
  const model = selectedModel();
  const message = $('message').value.trim();

  if (!baseUrl) {
    setStatus('请先填写 Base URL', 'bad', '没有 Base URL 无法测试。');
    return;
  }
  if (!apiKey) {
    setStatus('缺少 API Key', 'bad', '聊天测试需要 Key；留空只能做连通性测试。');
    return;
  }
  if (!model) {
    setStatus('请先选择或填写模型', 'bad', '可先探测模型，或直接手填模型名。');
    return;
  }
  if (!message) return;

  const provider = inferProvider(mode, baseUrl);
  const paths = manualPath ? [manualPath] : candidateChatPaths(provider, baseUrl);

  addBubble('user', message, model);
  setStatus('正在发送聊天测试…', 'warn', '浏览器正在直接调用目标 API。');
  show('正在发送聊天测试…');

  const attempts = [];
  for (const path of paths) {
    const url = joinUrl(baseUrl, path);
    try {
      const started = Date.now();
      const result = await requestJson(url, {
        method: 'POST',
        headers: buildHeaders({ provider, apiKey, json: true }),
        body: JSON.stringify(buildChatBody({ provider, model, message, path })),
      });
      const durationMs = Date.now() - started;
      attempts.push({ path, status: result.status, ok: result.ok, url, durationMs, preview: result.json });
      if (result.ok) {
        const responseText = extractChatText(provider, result.json);
        addBubble('assistant', responseText || '[empty response]', `${provider} · ${path}`);
        $('message').value = '';
        setStatus(`成功 · ${durationMs}ms`, 'ok', `通过 ${path} 收到响应。`);
        show({ ok: true, provider, path, durationMs, response: responseText, attempts, raw: result.json });
        return;
      }
    } catch (error) {
      attempts.push({ path, ok: false, url, error: String(error.message || error) });
    }
  }

  addBubble('assistant', '聊天请求失败，请看下方 INFO。', 'error', true);
  setStatus('聊天测试失败', 'bad', '可能是 CORS、鉴权、路径错误或接口格式不兼容。');
  show({ ok: false, provider, model, attempts });
}

function clearAll() {
  $('baseUrl').value = '';
  $('apiKey').value = '';
  $('manualPath').value = '';
  $('manualModel').value = '';
  $('message').value = '';
  $('mode').value = 'auto';
  $('chatTimeline').innerHTML = '';
  $('result').textContent = '等待测试…';
  setModels([]);
  ensureEmptyState();
  setStatus('已清空当前页', 'warn', '当前页临时状态已清空；不会持久化保存。');
}

function fillDemo() {
  $('baseUrl').value = 'https://api.openai.com/v1';
  $('mode').value = 'openai';
  $('manualPath').value = '';
  $('manualModel').value = '';
  $('message').value = '你好，请简单介绍一下你自己。';
  setStatus('已填入示例', 'warn', '可先填 Key 后探测模型。');
}

function bindComposerBehavior() {
  const isMobileLike = window.matchMedia('(max-width: 720px)').matches || 'ontouchstart' in window;
  $('composerTip').textContent = isMobileLike ? '手机端 Enter 换行，点发送提交' : '桌面端 Enter 发送，Shift+Enter 换行';
  $('message').addEventListener('keydown', (e) => {
    if (isMobileLike) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chat();
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  $('probeBtn').addEventListener('click', probe);
  $('chatBtn').addEventListener('click', chat);
  $('chatBtnBottom').addEventListener('click', chat);
  $('clearBtn').addEventListener('click', clearAll);
  $('fillDemoBtn').addEventListener('click', fillDemo);
  $('themeToggle').addEventListener('click', toggleTheme);
  setModels([]);
  ensureEmptyState();
  bindComposerBehavior();
});

