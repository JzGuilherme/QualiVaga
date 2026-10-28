const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

const root = path.join(__dirname, '..');
const bundledBackground = buildSync({
  entryPoints: [path.join(root, 'background.js')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'QualiVagaBg',
  platform: 'browser'
}).outputFiles[0].text;

function harness(fetchImpl) {
  let listener;
  const calls = [];
  const sessionStore = {};
  const localStore = {
    apiKey: 'sk-test-only-not-a-real-credential',
    masterProfile: {
      perfil: {
        titulo: 'Desenvolvedor Full Stack',
        senioridade: 'pleno',
        resumo: 'Desenvolvedor com experiência prática em JavaScript, React e Node.js.'
      },
      palavras_chave_busca: ['Desenvolvedor Full Stack', 'React'],
      hard_skills: ['JavaScript', 'React', 'Node.js'],
      projetos_e_experiencias: [
        {
          titulo: 'Engenheiro Front-end',
          organizacao: 'Tech Corp',
          descricao: 'Desenvolvimento de SPAs com JavaScript e React.',
          tecnologias: ['JavaScript', 'React']
        }
      ],
      formacao: [{ curso: 'Ciência da Computação', instituicao: 'USP' }],
      preferencias_vaga: {
        modalidades: ['remoto', 'hibrido'],
        plataformas_ativas: ['Gupy', 'LinkedIn', 'InfoJobs']
      },
      email: 'private@example.org',
      cpf: '12345678901'
    }
  };
  const key = localStore.apiKey;
  const chrome = {
    storage: {
      local: {
        setAccessLevel: async value => { calls.push(['access', value]); },
        get: async keys => {
          if (typeof keys === 'string') return { [keys]: localStore[keys] };
          return { ...localStore };
        },
        set: async obj => { Object.assign(localStore, obj); }
      },
      session: {
        get: async keys => {
          if (typeof keys === 'string') return { [keys]: sessionStore[keys] };
          return { ...sessionStore };
        },
        set: async obj => { Object.assign(sessionStore, obj); }
      }
    },
    runtime: {
      id: 'extension-id',
      onMessage: { addListener(fn) { listener = fn; } },
      openOptionsPage: async () => {}
    },
    action: { onClicked: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} } }
  };
  const context = vm.createContext({
    chrome,
    URL,
    AbortController,
    TypeError,
    console,
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 25000 ? ms : 0),
    clearTimeout,
    fetch: async (url, options) => {
      calls.push(['fetch', url, options]);
      return fetchImpl(url, options);
    }
  });
  vm.runInContext(bundledBackground, context);
  const sender = { id: 'extension-id', frameId: 0, tab: { id: 1 }, url: 'https://empresa.gupy.io/jobs/123' };
  return {
    context,
    calls,
    key,
    sender,
    sessionStore,
    localStore,
    send: (message, origin = sender) => new Promise(resolve => listener(message, origin, resolve))
  };
}

const payload = () => ({
  title: 'Desenvolvedor',
  description: 'Vaga para desenvolvimento de sistemas web com JavaScript, testes automatizados, acessibilidade e colaboração em equipe. '.repeat(3),
  questions: [{ field_label_hint: '[Q1] Conte sua experiência', max_length: 500 }]
});

const result = () => ({
  match_score: 75,
  match_reason: 'Tenho JavaScript no perfil. Faltam evidências de testes.',
  key_skills_found: ['JavaScript'],
  missing_skills: ['Testes'],
  answers: [
    {
      field_label_hint: '[Q1] Conte sua experiência',
      fato_base_curriculo: 'Experiência na Tech Corp com JavaScript e React',
      rascunho_resposta: 'Possuo conhecimentos práticos de JavaScript aplicados na Tech Corp.'
    }
  ]
});

const success = data => ({
  ok: true,
  json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] })
});

test('authorized flow uses strict json_schema, store: false, temperature: 0.2, and keeps credentials out of reply and prompt', async () => {
  const h = harness(async () => success(result()));
  const response = await h.send({ type: 'ANALYZE', payload: payload() });
  assert.equal(response.ok, true);
  assert.equal(response.data.match_score, 75);
  assert.equal(response.data.answers[0].fato_base_curriculo, 'Experiência na Tech Corp com JavaScript e React');
  const request = h.calls.find(call => call[0] === 'fetch');
  const body = JSON.parse(request[2].body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.equal(body.store, false);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(request[2].headers.Authorization, `Bearer ${h.key}`);
  assert.ok(!request[2].body.includes(h.key));
  assert.ok(!request[2].body.includes('private@example.org'));
  assert.ok(!request[2].body.includes('12345678901'));
  assert.ok(!JSON.stringify(response).includes(h.key));
  assert.equal(h.calls[0][1].accessLevel, 'TRUSTED_CONTEXTS');
});

test('multi-platform job discovery aggregates Gupy, LinkedIn, and InfoJobs with hybrid match score', async () => {
  const h = harness(async (url) => {
    if (url.includes('portal.api.gupy.io')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: 101,
              name: 'Desenvolvedor Full Stack Pleno',
              careerPageName: 'GupyTech',
              city: 'São Paulo',
              state: 'SP',
              workplaceType: 'remoto',
              jobUrl: 'https://gupytech.gupy.io/jobs/101',
              description: 'Buscamos pessoa desenvolvedora com JavaScript, React, Node.js e Docker.'
            }
          ]
        })
      };
    }
    if (url.includes('linkedin.com')) {
      return {
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => `
          <li>
            <div data-entity-urn="urn:li:jobPosting:202">
              <h3 class="base-search-card__title">Engenheiro Front-end React</h3>
              <h4 class="base-search-card__subtitle">LinkedInCorp</h4>
              <span class="job-search-card__location">Remoto - Brasil</span>
              <p class="job-search-card__snippet">Vaga remota para trabalhar com React e JavaScript.</p>
              <a href="https://www.linkedin.com/jobs/view/202">Ver vaga</a>
            </div>
          </li>`
      };
    }
    if (url.includes('infojobs.com.br')) {
      return {
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => `
          <div class="js_rowCard" data-id="303">
            <h2>Desenvolvedor Node.js</h2>
            <div class="company-name">InfoCorp</div>
            <div class="location">Híbrido - SP</div>
            <p class="vagaDesc">Experiência com Node.js, JavaScript e SQL.</p>
            <a href="/vaga-de-node__303.aspx">Link</a>
          </div>`
      };
    }
    if (url.includes('api.openai.com/v1/chat/completions')) {
      return success({
        evaluations: [
          {
            job_id: 'gupy-101',
            semantic_score: 90,
            fato_base_curriculo: 'Experiência na Tech Corp com JavaScript e React',
            match_reason: 'Excelente aderência com a stack principal.'
          }
        ]
      });
    }
    return { ok: false, status: 404 };
  });

  const res = await h.send({ type: 'DISCOVER_JOBS' });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.data.totalFound, 3);
  assert.equal(res.data.platformCounts.Gupy, 1);
  assert.equal(res.data.platformCounts.LinkedIn, 1);
  assert.equal(res.data.platformCounts.InfoJobs, 1);
  assert.ok(res.data.jobs[0].matchScore >= res.data.jobs[1].matchScore);
  assert.ok(h.sessionStore.lastDiscovery.totalFound === 3);
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
  const clean = vm.runInContext('QualiVagaBg.cleanText', h.context);
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
    data => { data.match_score = 101; },
    data => { data.match_score = '75'; },
    data => { data.answers[0].field_label_hint = '[Q2] Outra pergunta'; },
    data => { data.answers.push(data.answers[0]); },
    data => { data.answers[0].rascunho_resposta = 'x'.repeat(501); }
  ]) {
    const data = result();
    mutate(data);
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

test('manifest has multi-platform permissions and scripts contain no unsafe HTML sinks', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
  assert.ok(manifest.host_permissions.includes('*://*.gupy.io/*'));
  assert.ok(manifest.host_permissions.includes('*://*.linkedin.com/*'));
  assert.ok(manifest.host_permissions.includes('*://*.infojobs.com.br/*'));
  assert.ok(manifest.host_permissions.includes('https://api.openai.com/*'));
  for (const file of ['background.js', 'content.js', 'options.js', 'src/adapters.js', 'src/match-engine.js', 'src/resume-validator.js', 'src/telemetry-debug.js']) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function\s*\(/);
  }
});
