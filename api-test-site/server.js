const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const {
  buildChatBody,
  buildHeaders,
  buildJsonHeaders,
  candidateChatPaths,
  candidateConnectivityPaths,
  candidateModelPaths,
  extractChatText,
  extractModels,
  inferProvider,
  joinUrl,
  normalizeBaseUrl,
} = require('./lib/provider');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 28882);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

async function request(url, options = {}) {
  const start = Date.now();
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    ok: res.ok,
    status: res.status,
    durationMs: Date.now() - start,
    headers: Object.fromEntries(res.headers.entries()),
    text,
    json,
  };
}

function summarizeAttempt(routePath, result) {
  return {
    path: routePath,
    status: result.status,
    ok: result.ok,
    durationMs: result.durationMs,
    preview: result.text.slice(0, 400),
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function serveStatic(req, res) {
  const reqPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const safePath = path.normalize(reqPath).replace(/^\.+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { ok: false, error: 'forbidden' });
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { ok: false, error: 'not found' });
  }
}

async function handleProbe(req, res) {
  try {
    const body = await readBody(req);
    const baseUrl = normalizeBaseUrl(body?.baseUrl);
    const apiKey = String(body?.apiKey || '').trim();
    const mode = String(body?.mode || 'auto');
    const manualPath = String(body?.manualPath || '').trim();
    const provider = inferProvider(mode, baseUrl);

    if (!baseUrl) return sendJson(res, 400, { ok: false, error: 'baseUrl is required' });

    const attempts = [];

    if (!apiKey) {
      const paths = manualPath ? [manualPath] : candidateConnectivityPaths(provider, baseUrl);
      for (const p of paths) {
        try {
          const result = await request(joinUrl(baseUrl, p), {
            method: 'GET',
            headers: buildHeaders({ provider, apiKey }),
          });
          attempts.push(summarizeAttempt(p, result));
          if (result.status > 0 && result.status < 500) {
            return sendJson(res, 200, {
              ok: true,
              provider,
              connectivity: attempts,
              note: 'No apiKey provided; connectivity test only.',
            });
          }
        } catch (error) {
          attempts.push({ path: p, ok: false, status: 0, durationMs: 0, preview: String(error.message || error) });
        }
      }
      return sendJson(res, 502, { ok: false, provider, connectivity: attempts, note: 'Base URL did not respond on common paths.' });
    }

    const paths = manualPath ? [manualPath] : candidateModelPaths(provider, baseUrl);
    for (const p of paths) {
      try {
        const result = await request(joinUrl(baseUrl, p), {
          method: 'GET',
          headers: buildHeaders({ provider, apiKey }),
        });
        attempts.push(summarizeAttempt(p, result));
        if (result.ok) {
          return sendJson(res, 200, {
            ok: true,
            provider,
            mode,
            modelPath: p,
            models: extractModels(provider, result.json),
            attempts,
          });
        }
      } catch (error) {
        attempts.push({ path: p, ok: false, status: 0, durationMs: 0, preview: String(error.message || error) });
      }
    }

    return sendJson(res, 502, { ok: false, error: 'Failed to fetch models', provider, attempts });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || String(error) });
  }
}

async function handleChat(req, res) {
  try {
    const body = await readBody(req);
    const baseUrl = normalizeBaseUrl(body?.baseUrl);
    const apiKey = String(body?.apiKey || '').trim();
    const model = String(body?.model || '').trim();
    const mode = String(body?.mode || 'auto');
    const manualPath = String(body?.manualPath || '').trim();
    const message = String(body?.message || '').trim();
    const provider = inferProvider(mode, baseUrl);

    if (!baseUrl || !apiKey || !model || !message) {
      return sendJson(res, 400, { ok: false, error: 'baseUrl, apiKey, model, message are required' });
    }

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
          return sendJson(res, 200, {
            ok: true,
            provider,
            path: p,
            durationMs: result.durationMs,
            response: extractChatText(provider, result.json),
            raw: result.json,
            attempts,
          });
        }
      } catch (error) {
        attempts.push({ path: p, ok: false, status: 0, durationMs: 0, preview: String(error.message || error) });
      }
    }

    return sendJson(res, 502, { ok: false, error: 'All chat paths failed', provider, attempts });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || String(error) });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    return sendJson(res, 200, { ok: true, now: new Date().toISOString() });
  }

  if (req.method === 'POST' && req.url === '/api/probe') {
    return handleProbe(req, res);
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    return handleChat(req, res);
  }

  if (req.method === 'GET') {
    return serveStatic(req, res);
  }

  return sendJson(res, 405, { ok: false, error: 'method not allowed' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`api-test-site listening on http://0.0.0.0:${PORT}`);
});
