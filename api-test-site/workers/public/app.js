const THEME_KEY = 'api-test-theme';

function $(id) {
  return document.getElementById(id);
}

function payload() {
  return {
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    mode: $('mode').value,
    manualPath: $('manualPath').value.trim(),
  };
}

function isMobileLike() {
  return window.matchMedia('(max-width: 720px)').matches || 'ontouchstart' in window;
}

function setStatus(text, kind = '', hint = '') {
  const el = $('statusBar');
  el.textContent = text;
  el.className = `status-bar ${kind}`.trim();
  if (hint !== undefined && $('statusHint')) $('statusHint').textContent = hint || '';
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

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  $('themeToggle').textContent = theme === 'dark' ? '☀️ 切换亮色' : '🌙 切换暗色';
}

function loadTheme() {
  try {
    const saved = sessionStorage.getItem(THEME_KEY) || 'light';
    applyTheme(saved);
  } catch {
    applyTheme('light');
  }
}

function toggleTheme() {
  const current = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    sessionStorage.setItem(THEME_KEY, next);
  } catch {}
}

function fillDemo() {
  $('baseUrl').value = 'https://api.openai.com/v1';
  $('mode').value = 'openai';
  $('manualPath').value = '';
  $('message').value = '你好，请简单介绍一下你自己。';
  setStatus('已填入示例', 'warn', '示例已填好，可以直接探测模型。');
}

function ensureTimelineEmptyState() {
  const box = $('chatTimeline');
  if (!box.children.length) {
    box.innerHTML = '<div class="chat-empty">先探测模型，再在这里发起聊天测试。</div>';
  }
}

function clearEmptyState() {
  const box = $('chatTimeline');
  const empty = box.querySelector('.chat-empty');
  if (empty) empty.remove();
}

function addBubble(role, text, meta = '') {
  clearEmptyState();
  const box = $('chatTimeline');
  const row = document.createElement('div');
  row.className = `bubble-row ${role}`;

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

async function probe() {
  setStatus('正在探测…', 'warn', '正在尝试常见模型/连通路径。');
  show('正在探测…');
  const res = await fetch('/api/probe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload()),
  });
  const json = await res.json();
  if (json.models) setModels(json.models);
  if (json.ok) {
    const count = Array.isArray(json.models) ? json.models.length : (json.connectivity?.length || 0);
    setStatus(`成功 · ${count} 项结果`, 'ok', '可以开始右侧聊天测试了。');
  } else {
    setStatus(`失败 · HTTP ${res.status}`, 'bad', '请检查 Base URL、路径模式或 API Key。');
  }
  show(json);
}

async function chat() {
  const text = $('message').value.trim();
  if (!text) return;

  addBubble('user', text, $('modelSelect').value || '未选模型');
  setStatus('正在发送聊天测试…', 'warn', '请求已发出，等待 API 返回。');
  show('正在发送聊天测试…');

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...payload(),
      model: $('modelSelect').value,
      message: text,
    }),
  });
  const json = await res.json();
  if (json.ok) {
    setStatus(`成功 · ${json.durationMs || 0}ms`, 'ok', `已通过 ${json.path || 'auto'} 返回响应。`);
    addBubble('assistant', json.response || '[empty response]', `${json.provider || 'api'} · ${json.path || ''}`);
    $('message').value = '';
  } else {
    setStatus(`失败 · HTTP ${res.status}`, 'bad', '聊天请求失败，详细内容见下方 INFO。');
    addBubble('assistant', json.error || '请求失败', 'error');
  }
  show(json);
}

function clearAll() {
  $('baseUrl').value = '';
  $('apiKey').value = '';
  $('manualPath').value = '';
  $('message').value = '';
  $('mode').value = 'auto';
  $('result').textContent = '等待测试…';
  $('chatTimeline').innerHTML = '';
  setModels([]);
  ensureTimelineEmptyState();
  setStatus('已清空当前页', 'warn', '当前页临时状态已全部清空。');
}

function bindComposerBehavior() {
  const tip = $('composerTip');
  if (isMobileLike()) {
    tip.textContent = '手机端 Enter 换行，点发送提交';
  } else {
    tip.textContent = '桌面端 Enter 发送，Shift+Enter 换行';
  }

  $('message').addEventListener('keydown', (e) => {
    if (isMobileLike()) return;
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
  $('fillDemoBtn').addEventListener('click', fillDemo);
  $('clearBtn').addEventListener('click', clearAll);
  $('themeToggle').addEventListener('click', toggleTheme);
  setModels([]);
  ensureTimelineEmptyState();
  bindComposerBehavior();
});
