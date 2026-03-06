const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractModels,
  inferProvider,
  normalizeBaseUrl,
  buildChatBody,
  candidateChatPaths,
  candidateModelPaths,
} = require('../lib/provider');

test('normalizeBaseUrl adds https when missing', () => {
  assert.equal(normalizeBaseUrl('api.example.com/v1/'), 'https://api.example.com/v1');
});

test('inferProvider can detect anthropic by baseUrl', () => {
  assert.equal(inferProvider('auto', 'https://anthropic.example.com/v1'), 'anthropic');
});

test('extractModels supports data array ids', () => {
  const models = extractModels('openai', { data: [{ id: 'gpt-5.4' }, { id: 'gpt-5.3-codex' }] });
  assert.deepEqual(models, ['gpt-5.4', 'gpt-5.3-codex']);
});

test('buildChatBody creates anthropic request', () => {
  const body = buildChatBody({ provider: 'anthropic', model: 'claude-opus-4-6', message: 'hi' });
  assert.equal(body.model, 'claude-opus-4-6');
  assert.equal(body.messages[0].content, 'hi');
});

test('buildChatBody creates openai responses request body when path ends with /responses', () => {
  const body = buildChatBody({ provider: 'openai', model: 'gpt-5', message: 'hi', path: '/responses' });
  assert.equal(body.model, 'gpt-5');
  assert.equal(body.input, 'hi');
  assert.equal(body.max_output_tokens, 512);
});

test('openai chat paths include responses and chat completions', () => {
  assert.deepEqual(candidateChatPaths('openai', 'https://api.example.com'), ['/v1/chat/completions', '/chat/completions', '/v1/responses', '/responses']);
});

test('model paths add v1 when missing', () => {
  assert.deepEqual(candidateModelPaths('anthropic', 'https://api.example.com'), ['/v1/models', '/models']);
});
