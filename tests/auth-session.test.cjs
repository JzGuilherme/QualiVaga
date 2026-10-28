const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { selectStartPage } = require('./open-auth-browser.cjs');
const { loadLocalEnv } = require('./load-env.cjs');

function fixture(urls) {
  const navigations = [];
  const pages = urls.map(url => ({ url: () => url, goto: async target => navigations.push({ from: url, to: target }) }));
  const context = { pages: () => pages, newPage: async () => {
    const page = { url: () => 'about:blank', goto: async target => navigations.push({ from: 'new-tab', to: target }) };
    pages.push(page);
    return page;
  } };
  return { context, pages, navigations };
}

test('preserves a restored application without navigation or new tabs', async () => {
  const f = fixture(['about:blank', 'https://empresa.gupy.io/candidates/jobs/123/apply']);
  assert.equal(await selectStartPage(f.context), f.pages[1]);
  assert.deepEqual(f.navigations, []);
  assert.equal(f.pages.length, 2);
});

test('preserves existing tabs when opening the portal for a fresh session', async () => {
  const f = fixture(['https://example.org/']);
  await selectStartPage(f.context);
  assert.deepEqual(f.navigations, [{ from: 'new-tab', to: 'https://portal.gupy.io/' }]);
  assert.equal(f.pages[0].url(), 'https://example.org/');
});

test('reuses only a blank tab for initial portal navigation', async () => {
  const f = fixture(['about:blank']);
  assert.equal(await selectStartPage(f.context), f.pages[0]);
  assert.deepEqual(f.navigations, [{ from: 'about:blank', to: 'https://portal.gupy.io/' }]);
  assert.equal(f.pages.length, 1);
});

test('does not mistake a lookalike host for an existing Gupy session', async () => {
  const f = fixture(['https://gupy.io.example.org/form']);
  await selectStartPage(f.context);
  assert.deepEqual(f.navigations, [{ from: 'new-tab', to: 'https://portal.gupy.io/' }]);
});

test('loadLocalEnv parses .env variables safely and strips placeholder keys', () => {
  const root = path.resolve(__dirname, '..');
  assert.equal(fs.existsSync(path.join(root, '.env.example')), true, '.env.example must exist');
  const env = loadLocalEnv(root);
  assert.equal(typeof env.headless, 'boolean');
  assert.equal(fs.existsSync(env.resumePath), true);
  assert.equal(env.apiKey.includes('sua-chave-aqui'), false);
});
