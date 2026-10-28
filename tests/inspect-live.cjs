const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { loadLocalEnv } = require('./load-env.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const envConfig = loadLocalEnv(root);
  const context = await chromium.launchPersistentContext('', {
    channel: 'chrome', headless: envConfig.headless,
    args: ['--enable-unsafe-extension-debugging'],
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1440, height: 1000 }
  });
  try {
    const page = context.pages()[0];
    const cdp = await context.newCDPSession(page);
    const browserCdp = await context.browser().newBrowserCDPSession();
    const extension = await browserCdp.send('Extensions.loadUnpacked', { path: root });
    console.log('Extension loaded:', extension.id);
    // Public, read-only inspection: block non-GET/HEAD requests and never click Apply.
    await context.route('**/*', route => {
      const request = route.request();
      if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
      return route.continue();
    });
    const url = envConfig.gupyTestUrl;
    const target = new URL(url);
    assert.ok(target.protocol === 'https:' && target.hostname.endsWith('.gupy.io') && /^\/jobs\/\d+\/?$/.test(target.pathname), 'Use a public Gupy /jobs/id URL');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('h1').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
    const info = await page.evaluate(() => ({
      url: location.href, title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3')].map(e => ({ tag: e.tagName, text: e.textContent, id: e.id, testid: e.getAttribute('data-testid') })),
      regions: [...document.querySelectorAll('main,article,[role="main"],[data-testid],[itemprop="description"]')].map(e => ({ tag: e.tagName, id: e.id, testid: e.getAttribute('data-testid'), length: e.textContent.length })).slice(0, 100),
      fields: [...document.querySelectorAll('input,textarea')].map(e => ({tag: e.tagName, type: e.type, id: e.id, name: e.name, placeholder: e.placeholder, label: e.getAttribute('aria-label')})),
      links: [...document.querySelectorAll('a')].filter(e => /candidat/i.test(e.textContent)).map(e => ({text:e.textContent,href:e.href}))
    }));
    const { root: dom } = await cdp.send('DOM.getDocument', {depth: -1, pierce: true});
    function find(node) {
      if (node.attributes?.includes('gupy-ai-helper-root')) return node;
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) { const found = find(child); if (found) return found; }
    }
    const host = find(dom);
    if (host?.shadowRoots?.[0]) {
      const {object} = await cdp.send('DOM.resolveNode', {nodeId: host.shadowRoots[0].nodeId});
      const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId,
        functionDeclaration: 'function(){return {text:this.textContent,description:this.querySelector("textarea").value}}', returnByValue: true });
      info.widget = result.value;
    }
    assert.ok(info.widget, 'Extension widget must be present');
    assert.ok(info.widget.description.length >= 100, 'Job description must be detected');
    assert.ok(!info.widget.description.includes('Etapas do processo'), 'Process stages must not be included in the JD');
    assert.ok(info.widget.description.includes('Requisitos'), 'Requirements must be included');
    await page.screenshot({ path: path.join(root, 'test-results/live-gupy.png'), fullPage: false });
    await fs.writeFile(path.join(root, 'test-results/live-inspection.json'), JSON.stringify(info, null, 2));
    console.log(JSON.stringify({ url: info.url, title: info.title, fields: info.fields.length,
      descriptionLength: info.widget.description.length, widget: true, checks: 'passed' }, null, 2));
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
