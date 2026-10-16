const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../background.js'), 'utf8');

function harness(fetchImpl) {
  let listener;
  const calls = [];
  const key = 'sk-test-only-not-a-real-credential';
  const chrome = {
    storage: { local: {
      setAccessLevel: async value => { calls.push(['access', value]); },
      get: async () => ({ apiKey: key, masterProfile: { habilidades: ['JavaScript'], email: 'private@example.org', cpf: '12345678901' } })
    } },
    runtime: { id: 'extension-id', onMessage: { addListener(fn) { listener = fn; } }, openOptionsPage: async () => {} },
    action: { onClicked: { addListener() {} } }, tabs: { onRemoved: { addListener() {} } }
  };
  const context = vm.createContext({ chrome, URL, AbortController, TypeError, console,
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 25000 ? ms : 0), clearTimeout,
    fetch: async (url, options) => { calls.push(['fetch', url, options]); return fetchImpl(url, options); } });
  vm.runInContext(source, context);
  const sender = { id: 'extension-id', frameId: 0, tab: { id: 1 }, url: 'https://empresa.gupy.io/jobs/123' };
  return { context, calls, key, sender, send: (message, origin = sender) => new Promise(resolve => listener(message, origin, resolve)) };
}
const payload = () => ({ title: 'Desenvolvedor', description: 'Vaga para desenvolvimento de sistemas web com JavaScript, testes automatizados, acessibilidade e colaboração em equipe. '.repeat(3),
  questions: [{ field_label_hint: '[Q1] Conte sua experiência', max_length: 500 }] });
const result = () => ({ match_score: 75, match_reason: 'Tenho JavaScript no perfil. Faltam evidências de testes.', key_skills_found: ['JavaScript'], missing_skills: ['Testes'],
  answers: [{ field_label_hint: '[Q1] Conte sua experiência', generated_answer: 'Possuo conhecimentos de JavaScript.' }] });
const success = data => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] }) });

test('authorized flow uses requested JSON mode and keeps credentials out of reply and prompt', async () => {
  const h = harness(async () => success(result()));
  const response = await h.send({ type: 'ANALYZE', payload: payload() });
  assert.equal(response.ok, true);
  assert.equal(response.data.match_score, 75);
  const request = h.calls.find(call => call[0] === 'fetch');
  const body = JSON.parse(request[2].body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(request[2].headers.Authorization, `Bearer ${h.key}`);
  assert.ok(!request[2].body.includes(h.key));
  assert.ok(!request[2].body.includes('private@example.org'));
  assert.ok(!request[2].body.includes('12345678901'));
  assert.ok(!JSON.stringify(response).includes(h.key));
  assert.equal(h.calls[0][1].accessLevel, 'TRUSTED_CONTEXTS');
});

test('rejects forged origins, other extensions and frames before fetching', async () => {
  const h = harness(async () => success(result()));
  for (const override of [{ url: 'https://gupy.io.attacker.test/' }, { url: 'http://empresa.gupy.io/' }, { id: 'other' }, { frameId: 1 }]) {
    const response = await h.send({ type: 'ANALYZE', payload: payload() }, { ...h.sender, ...override });
    assert.equal(response.ok, false);
  }
  assert.equal(h.calls.filter(c => c[0] === 'fetch').length, 0);
});

test('sanitizes scripts, markup, emails, phone numbers, CPF and API keys', () => {
  const h = harness();
  const clean = vm.runInContext('cleanText', h.context);
  const text = clean('<script>secretScript()</script><p>JavaScript</p> user@example.com 123.456.789-01 (85) 99999-1234 sk-secretvalue');
  assert.ok(text.includes('JavaScript'));
  for (const forbidden of ['secretScript', '<p>', 'user@example.com', '123.456', '99999', 'sk-secret']) assert.ok(!text.includes(forbidden));
});

test('retries 429 and server failures, then succeeds', async () => {
  let count = 0;
  const h = harness(async () => ++count < 3 ? { ok: false, status: count === 1 ? 429 : 503, headers: { get: () => null } } : success(result()));
  assert.equal((await h.send({ type: 'ANALYZE', payload: payload() })).ok, true);
  assert.equal(count, 3);
});

test('does not retry authentication errors or expose upstream body', async () => {
  const h = harness(async () => ({ ok: false, status: 401 }));
  const response = await h.send({ type: 'ANALYZE', payload: payload() });
  assert.equal(response.ok, false);
  assert.match(response.error, /Chave inválida/);
  assert.equal(h.calls.filter(c => c[0] === 'fetch').length, 1);
});

test('rejects malformed scores, unknown fields, duplicate answers and oversized answers', async () => {
  for (const mutate of [
    data => { data.match_score = 101; }, data => { data.match_score = '75'; },
    data => { data.answers[0].field_label_hint = '[Q2] Outra pergunta'; },
    data => { data.answers.push(data.answers[0]); },
    data => { data.answers[0].generated_answer = 'x'.repeat(501); }
  ]) {
    const data = result(); mutate(data);
    const h = harness(async () => success(data));
    assert.equal((await h.send({ type: 'ANALYZE', payload: payload() })).ok, false);
  }
});

test('bounds network retries and permits a new request after failure', async () => {
  const h = harness(async () => { throw new TypeError('network unavailable'); });
  for (let i = 0; i < 2; i++) assert.equal((await h.send({ type: 'ANALYZE', payload: payload() })).ok, false);
  assert.equal(h.calls.filter(c => c[0] === 'fetch').length, 6);
});

test('cancels requests and blocks duplicate analysis per tab', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const h = harness(async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    started();
  }));
  const pending = h.send({ type: 'ANALYZE', payload: payload() });
  await ready;
  assert.equal((await h.send({ type: 'ANALYZE', payload: payload() })).ok, false);
  assert.equal((await h.send({ type: 'CANCEL' })).ok, true);
  assert.match((await pending).error, /cancelada/);
});

test('rejects too short description without network access', async () => {
  const h = harness();
  assert.equal((await h.send({ type: 'ANALYZE', payload: { ...payload(), description: 'curta' } })).ok, false);
  assert.equal(h.calls.filter(c => c[0] === 'fetch').length, 0);
});

test('manifest has strict permissions and scripts contain no unsafe HTML sinks', () => {
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
  assert.deepEqual(manifest.host_permissions, ['https://*.gupy.io/*', 'https://api.openai.com/*']);
  for (const file of ['background.js', 'content.js', 'options.js']) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function\s*\(/);
  }
});
