const HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API 测试站</title>
  <style>
    :root {
      --bg: #f7f7fb;
      --card: #ffffff;
      --text: #1f2430;
      --muted: #667085;
      --border: #e4e7ec;
      --primary: #7c5cff;
      --ok: #16a34a;
      --warn: #d97706;
      --bad: #dc2626;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .page {
      max-width: 1080px;
      margin: 0 auto;
      padding: 20px;
    }
    .hero, .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 8px 30px rgba(16, 24, 40, 0.06);
    }
    .hero { margin-bottom: 16px; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    .sub { color: var(--muted); font-size: 14px; }
    .grid {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 16px;
      align-items: start;
    }
    label { display: block; margin-bottom: 12px; font-size: 14px; color: var(--muted); }
    input, select, textarea, button {
      width: 100%;
      margin-top: 6px;
      padding: 12px 13px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: #fff;
      color: var(--text);
      font: inherit;
    }
    textarea { min-height: 110px; resize: vertical; }
    .row2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .actions { display: flex; gap: 10px; margin-top: 10px; }
    button {
      background: var(--primary);
      color: #fff;
      border: none;
      cursor: pointer;
      font-weight: 700;
    }
    button.secondary {
      background: #eef2ff;
      color: #4338ca;
      border: 1px solid #c7d2fe;
    }
    .status { font-weight: 700; margin-bottom: 8px; }
    .status.ok { color: var(--ok); }
    .status.warn { color: var(--warn); }
    .status.bad { color: var(--bad); }
    .hint { color: var(--muted); font-size: 13px; }
    .chat {
      min-height: 420px;
      max-height: 520px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px;
      background: #fafafa;
      margin-bottom: 12px;
    }
    .empty { color: var(--muted); text-align: center; padding: 36px 12px; }
    .msg { display: flex; margin: 10px 0; }
    .msg.user { justify-content: flex-end; }
    .bubble {
      max-width: 80%;
      border-radius: 14px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      background: #fff;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
    .msg.user .bubble {
      background: #ede9fe;
      border-color: #c4b5fd;
    }
    .meta { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    pre {
      margin: 0;
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 14px;
      padding: 14px;
      min-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .section-title { font-weight: 800; margin-bottom: 12px; }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .row2, .actions { grid-template-columns: 1fr; display: grid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <h1>API 测试站</h1>
      <div class="sub">临时会话，不做本地持久化，刷新即丢。适合快速测试 OpenAI / Anthropic 风格接口。</div>
    </div>

    <div class="grid">
      <div>
        <div class="card">
          <div class="section-title">连接设置</div>
          <div class="row2">
            <label>Base URL
              <input id="baseUrl" placeholder="例如 https://api.example.com/v1" />
            </label>
            <label>API 模式
              <select id="mode">
                <option value="auto">自动识别</option>
                <option value="openai">OpenAI 兼容</option>
                <option value="anthropic">Anthropic Messages</option>
              </select>
            </label>
          </div>
          <label>API Key（可选）
            <input id="apiKey" type="password" placeholder="留空则仅做连通性测试" />
          </label>
          <div class="row2">
            <label>手动路径（可选）
              <input id="manualPath" placeholder="例如 /models 或 /chat/completions" />
            </label>
            <label>可用模型
              <select id="modelSelect"></select>
            </label>
          </div>
          <div class="actions">
            <button id="probeBtn" type="button">探测 / 获取模型</button>
            <button id="clearBtn" class="secondary" type="button">清空当前页</button>
          </div>
        </div>

        <div class="card" style="margin-top: 16px;">
          <div class="section-title">状态</div>
          <div id="statusBar" class="status">等待测试…</div>
          <div id="statusHint" class="hint">先探测模型，成功后再聊天测试。</div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="section-title">聊天测试</div>
          <div id="timeline" class="chat"><div class="empty">先探测模型，再发起聊天测试。</div></div>
          <textarea id="message" placeholder="输入消息…"></textarea>
          <div class="actions">
            <button id="chatBtn" type="button">发送聊天测试</button>
          </div>
        </div>

        <div class="card" style="margin-top: 16px;">
          <div class="section-title">INFO</div>
          <pre id="result">等待测试…</pre>
        </div>
      </div>
    </div>
  </div>

  <script>
    function $(id) { return document.getElementById(id); }
    function payload() {
      return {
        baseUrl: $('baseUrl').value.trim(),
        apiKey: $('apiKey').value.trim(),
        mode: $('mode').value,
        manualPath: $('manualPath').value.trim(),
      };
    }
    function setStatus(text, kind = '', hint = '') {
      const el = $('statusBar');
      el.textContent = text;
      el.className = 'status ' + kind;
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
    function clearEmpty() {
      const empty = $('timeline').querySelector('.empty');
      if (empty) empty.remove();
    }
    function ensureEmpty() {
      if (!$('timeline').children.length) $('timeline').innerHTML = '<div class="empty">先探测模型，再发起聊天测试。</div>';
    }
    function addMsg(role, text, meta = '') {
      clearEmpty();
      const row = document.createElement('div');
      row.className = 'msg ' + role;
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      const metaEl = document.createElement('div');
      metaEl.className = 'meta';
      metaEl.textContent = meta || (role === 'user' ? '你' : 'API');
      const textEl = document.createElement('div');
      textEl.textContent = text;
      bubble.appendChild(metaEl);
      bubble.appendChild(textEl);
      row.appendChild(bubble);
      $('timeline').appendChild(row);
      $('timeline').scrollTop = $('timeline').scrollHeight;
    }
    async function probe() {
      setStatus('正在探测…', 'warn', '正在尝试常见路径。');
      show('正在探测…');
      const res = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload()),
      });
      const json = await res.json();
      if (json.models) setModels(json.models);
      if (json.ok) {
        setStatus('探测成功', 'ok', '可以开始聊天测试了。');
      } else {
        setStatus('探测失败', 'bad', '请检查 Base URL / Key / 路径。');
      }
      show(json);
    }
    async function chat() {
      const text = $('message').value.trim();
      if (!text) return;
      addMsg('user', text, $('modelSelect').value || '未选模型');
      setStatus('正在发送…', 'warn', '等待 API 返回。');
      show('正在发送…');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload(), model: $('modelSelect').value, message: text }),
      });
      const json = await res.json();
      if (json.ok) {
        addMsg('assistant', json.response || '[empty response]', (json.provider || 'api') + ' · ' + (json.path || 'auto'));
        $('message').value = '';
        setStatus('聊天成功', 'ok', '接口响应正常。');
      } else {
        addMsg('assistant', json.error || '请求失败', 'error');
        setStatus('聊天失败', 'bad', '详细信息见下方 INFO。');
      }
      show(json);
    }
    function clearAll() {
      $('baseUrl').value = '';
      $('apiKey').value = '';
      $('manualPath').value = '';
      $('message').value = '';
      $('mode').value = 'auto';
      $('timeline').innerHTML = '';
      ensureEmpty();
      setModels([]);
      show('等待测试…');
      setStatus('已清空', 'warn', '当前页临时状态已全部清空。');
    }
    $('probeBtn').addEventListener('click', probe);
    $('chatBtn').addEventListener('click', chat);
    $('clearBtn').addEventListener('click', clearAll);
    $('message').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
        e.preventDefault();
        chat();
      }
    });
    setModels([]);
    ensureEmpty();
  </script>
</body>
</html>`;

function trimSlash(str = '') {
  return String(str).replace(/\/+$/, '');
}

function joinUrl(baseUrl, path = '') {
  const base = trimSlash(baseUrl || '');
  const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
  return `${base}${suffix}`;
}

function normalizeBaseUrl(input = '') {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return trimSlash(raw);
  return trimSlash(`https://${raw}`);
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

function buildHeaders({ provider, apiKey }) {
  const headers = { accept: 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (provider === 'anthropic') headers['anthropic-version'] = '2023-06-01';
  return headers;
}

function buildJsonHeaders({ provider, apiKey }) {
  return { ...buildHeaders({ provider, apiKey }), 'content-type': 'application/json' };
}

function extractModels(_provider, payload) {
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  return data.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item.id === 'string') return item.id;
    if (item && typeof item.name === 'string') return item.name;
    return null;
  }).filter(Boolean);
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

async function request(url, options = {}) {
  const start = Date.now();
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return {
    ok: res.ok,
    status: res.status,
    durationMs: Date.now() - start,
    text,
    json,
  };
}

function summarizeAttempt(path, result) {
  return {
    path,
    status: result.status,
    ok: result.ok,
    durationMs: result.durationMs,
    preview: result.text.slice(0, 400),
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
      'cache-control': 'no-store',
    },
  });
}

export default {
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return json({ ok: true }, 200);
    if (req.method === 'GET' && url.pathname === '/') {
      return new Response(HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return json({ ok: true, now: new Date().toISOString() });
    }

    if (url.pathname === '/api/probe' && req.method === 'POST') {
      try {
        const body = await req.json();
        const baseUrl = normalizeBaseUrl(body?.baseUrl);
        const apiKey = String(body?.apiKey || '').trim();
        const mode = String(body?.mode || 'auto');
        const manualPath = String(body?.manualPath || '').trim();
        const provider = inferProvider(mode, baseUrl);
        if (!baseUrl) return json({ ok: false, error: 'baseUrl is required' }, 400);

        const attempts = [];
        if (!apiKey) {
          const paths = manualPath ? [manualPath] : candidateConnectivityPaths(provider, baseUrl);
          for (const p of paths) {
            try {
              const result = await request(joinUrl(baseUrl, p), { method: 'GET', headers: buildHeaders({ provider, apiKey }) });
              attempts.push(summarizeAttempt(p, result));
              if (result.status > 0 && result.status < 500) {
                return json({ ok: true, provider, connectivity: attempts, note: 'No apiKey provided; connectivity test only.' });
              }
            } catch (error) {
              attempts.push({ path: p, ok: false, status: 0, durationMs: 0, preview: String(error.message || error) });
            }
          }
          return json({ ok: false, provider, connectivity: attempts, note: 'Base URL did not respond on common paths.' }, 502);
        }

        const paths = manualPath ? [manualPath] : candidateModelPaths(provider, baseUrl);
        for (const p of paths) {
          try {
            const result = await request(joinUrl(baseUrl, p), { method: 'GET', headers: buildHeaders({ provider, apiKey }) });
            attempts.push(summarizeAttempt(p, result));
            if (result.ok) {
              return json({ ok: true, provider, mode, modelPath: p, models: extractModels(provider, result.json), attempts });
            }
          } catch (error) {
            attempts.push({ path: p, ok: false, status: 0, durationMs: 0, preview: String(error.message || error) });
          }
        }
        return json({ ok: false, error: 'Failed to fetch models', provider, attempts }, 502);
      } catch (error) {
        return json({ ok: false, error: error.message || String(error) }, 500);
      }
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      try {
        const body = await req.json();
        const baseUrl = normalizeBaseUrl(body?.baseUrl);
        const apiKey = String(body?.apiKey || '').trim();
        const model = String(body?.model || '').trim();
        const mode = String(body?.mode || 'auto');
        const manualPath = String(body?.manualPath || '').trim();
        const message = String(body?.message || '').trim();
        const provider = inferProvider(mode, baseUrl);
        if (!baseUrl || !apiKey || !model || !message) return json({ ok: false, error: 'baseUrl, apiKey, model, message are required' }, 400);

        const paths = manualPath ? [manualPath] : candidateChatPaths(provider, baseUrl);
        const attempts = [];
        for (const p of paths) {
          try {
            const result = await request(joinUrl(baseUrl, p), {
              method: 'POST',
              headers: buildJsonHeaders({ provider, apiKey }),
              body: JSON.stringify(buildChatBody({ provider, model, message, path: p })),
            });
            attempts.push(summarizeAttempt(p, result));
            if (result.ok) {
              return json({ ok: true, provider, path: p, durationMs: result.durationMs, response: extractChatText(provider, result.json), raw: result.json, attempts });
            }
          } catch (error) {
            attempts.push({ path: p, ok: false, status: 0, durationMs: 0, preview: String(error.message || error) });
          }
        }
        return json({ ok: false, error: 'All chat paths failed', provider, attempts }, 502);
      } catch (error) {
        return json({ ok: false, error: error.message || String(error) }, 500);
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
