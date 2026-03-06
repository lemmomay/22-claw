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
    headers: Object.fromEntries(res.headers.entries()),
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
    },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return json({ ok: true }, 200);
    if (url.pathname === '/healthz') return json({ ok: true, now: new Date().toISOString() });

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

    return env.ASSETS.fetch(req);
  },
};
