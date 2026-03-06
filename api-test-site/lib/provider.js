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
  if (provider === 'anthropic') {
    return uniq(hasV1 ? ['/models'] : ['/v1/models', '/models']);
  }
  return uniq(hasV1 ? ['/models'] : ['/v1/models', '/models']);
}

function candidateChatPaths(provider, baseUrl = '') {
  const hasV1 = baseHasV1(baseUrl);
  if (provider === 'anthropic') {
    return uniq(hasV1 ? ['/messages'] : ['/v1/messages', '/messages']);
  }
  return uniq(
    hasV1
      ? ['/chat/completions', '/responses']
      : ['/v1/chat/completions', '/chat/completions', '/v1/responses', '/responses']
  );
}

function candidateConnectivityPaths(provider, baseUrl = '') {
  return uniq(['/', ...candidateModelPaths(provider, baseUrl), ...candidateChatPaths(provider, baseUrl)]);
}

function buildHeaders({ provider, apiKey }) {
  const headers = {
    accept: 'application/json',
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  if (provider === 'anthropic') headers['anthropic-version'] = '2023-06-01';
  return headers;
}

function buildJsonHeaders({ provider, apiKey }) {
  return {
    ...buildHeaders({ provider, apiKey }),
    'content-type': 'application/json',
  };
}

function extractModels(_provider, payload) {
  const data = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];

  return data
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item.id === 'string') return item.id;
      if (item && typeof item.name === 'string') return item.name;
      return null;
    })
    .filter(Boolean);
}

function isResponsesPath(path = '') {
  return /\/responses$/i.test(String(path || ''));
}

function buildChatBody({ provider, model, message, path }) {
  const text = String(message || '').trim() || 'Hello';
  if (provider === 'anthropic') {
    return {
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: text }],
    };
  }

  if (isResponsesPath(path)) {
    return {
      model,
      input: text,
      max_output_tokens: 512,
    };
  }

  return {
    model,
    messages: [{ role: 'user', content: text }],
    max_tokens: 512,
  };
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

module.exports = {
  buildChatBody,
  buildHeaders,
  buildJsonHeaders,
  candidateChatPaths,
  candidateConnectivityPaths,
  candidateModelPaths,
  extractChatText,
  extractModels,
  inferProvider,
  isResponsesPath,
  joinUrl,
  normalizeBaseUrl,
};
