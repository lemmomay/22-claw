const express = require('express');
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

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

function summarizeAttempt(path, result) {
  return {
    path,
    status: result.status,
    ok: result.ok,
    durationMs: result.durationMs,
    preview: result.text.slice(0, 400),
  };
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.post('/api/probe', async (req, res) => {
  try {
    const baseUrl = normalizeBaseUrl(req.body?.baseUrl);
    const apiKey = String(req.body?.apiKey || '').trim();
    const mode = String(req.body?.mode || 'auto');
    const manualPath = String(req.body?.manualPath || '').trim();
    const provider = inferProvider(mode, baseUrl);

    if (!baseUrl) return res.status(400).json({ ok: false, error: 'baseUrl is required' });

    const attempts = [];

    if (!apiKey) {
      const paths = manualPath ? [manualPath] : candidateConnectivityPaths(provider, baseUrl);
      for (const p of paths) {
        const url = joinUrl(baseUrl, p);
        try {
          const result = await request(url, {
            method: 'GET',
            headers: buildHeaders({ provider, apiKey }),
          });
          attempts.push(summarizeAttempt(p, result));
          if (result.status > 0 && result.status < 500) {
            return res.json({
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

      return res.status(502).json({ ok: false, provider, connectivity: attempts, note: 'Base URL did not respond on common paths.' });
    }

    const paths = manualPath ? [manualPath] : candidateModelPaths(provider, baseUrl);
    for (const p of paths) {
      const url = joinUrl(baseUrl, p);
      try {
        const result = await request(url, {
          method: 'GET',
          headers: buildHeaders({ provider, apiKey }),
        });
        attempts.push(summarizeAttempt(p, result));
        if (result.ok) {
          return res.json({
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

    return res.status(502).json({ ok: false, error: 'Failed to fetch models', provider, attempts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const baseUrl = normalizeBaseUrl(req.body?.baseUrl);
    const apiKey = String(req.body?.apiKey || '').trim();
    const model = String(req.body?.model || '').trim();
    const mode = String(req.body?.mode || 'auto');
    const manualPath = String(req.body?.manualPath || '').trim();
    const message = String(req.body?.message || '').trim();
    const provider = inferProvider(mode, baseUrl);

    if (!baseUrl || !apiKey || !model || !message) {
      return res.status(400).json({ ok: false, error: 'baseUrl, apiKey, model, message are required' });
    }

    const paths = manualPath ? [manualPath] : candidateChatPaths(provider, baseUrl);
    const attempts = [];

    for (const p of paths) {
      const url = joinUrl(baseUrl, p);
      try {
        const result = await request(url, {
          method: 'POST',
          headers: buildJsonHeaders({ provider, apiKey }),
          body: JSON.stringify(buildChatBody({ provider, model, message, path: p })),
        });
        attempts.push(summarizeAttempt(p, result));
        if (result.ok) {
          return res.json({
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

    return res.status(502).json({ ok: false, error: 'All chat paths failed', provider, attempts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
});

const PORT = Number(process.env.PORT || 28882);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`api-test-site listening on http://0.0.0.0:${PORT}`);
});
 note: 'Base URL did not respond on common paths.' });
    }

    const paths = manualPath ? [manualPath] : candidateModelPaths(provider, baseUrl);
    for (const p of paths) {
      const url = joinUrl(baseUrl, p);
      try {
        const result = await request(url, {
          method: 'GET',
          headers: buildHeaders({ provider, apiKey }),
        });
        attempts.push(summarizeAttempt(p, result));
        if (result.ok) {
          return res.json({
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

    return res.status(502).json({ ok: false, error: 'Failed to fetch models', provider, attempts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const baseUrl = normalizeBaseUrl(req.body?.baseUrl);
    const apiKey = String(req.body?.apiKey || '').trim();
    const model = String(req.body?.model || '').trim();
    const mode = String(req.body?.mode || 'auto');
    const manualPath = String(req.body?.manualPath || '').trim();
    const message = String(req.body?.message || '').trim();
    const provider = inferProvider(mode, baseUrl);

    if (!baseUrl || !apiKey || !model || !message) {
      return res.status(400).json({ ok: false, error: 'baseUrl, apiKey, model, message are required' });
    }

    const paths = manualPath ? [manualPath] : candidateChatPaths(provider, baseUrl);
    const attempts = [];

    for (const p of paths) {
      const url = joinUrl(baseUrl, p);
      try {
        const result = await request(url, {
          method: 'POST',
          headers: buildJsonHeaders({ provider, apiKey }),
          body: JSON.stringify(buildChatBody({ provider, model, message })),
        });
        attempts.push(summarizeAttempt(p, result));
        if (result.ok) {
          return res.json({
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

    return res.status(502).json({ ok: false, error: 'All chat paths failed', provider, attempts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
});

const PORT = Number(process.env.PORT || 28882);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`api-test-site listening on http://0.0.0.0:${PORT}`);
});
