const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildSync } = require('esbuild');
const path = require('node:path');
const fs = require('node:fs/promises');
const root = path.resolve(__dirname, '..');
const description = 'Desenvolvimento de sistemas web com JavaScript e React, colaboração em equipe e melhoria contínua dos produtos digitais. '.repeat(3);
const bundle = buildSync({ stdin: { contents: `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  function App() {
    const [values,setValues] = React.useState({existing:'Texto já escrito'});
    const [blurs,setBlurs] = React.useState(0);
    const field = (id,label) => React.createElement('label',{key:id},label,
      React.createElement('textarea',{id,value:values[id]||'',onChange:e=>setValues(v=>({...v,[id]:e.target.value})),onBlur:()=>setBlurs(v=>v+1)}));
    return React.createElement('form',{onSubmit:e=>{e.preventDefault();window.submitted=true}},
      field('first','Conte sua trajetória'),field('second','Descreva seus objetivos'),field('existing','Conte suas realizações'),
      React.createElement('output',{id:'react-state'},JSON.stringify({values,blurs})),
      React.createElement('button',{type:'submit'},'Enviar candidatura'));
  }
  createRoot(document.getElementById('react')).render(React.createElement(App));
`, resolveDir: root, loader: 'js' }, bundle: true, write: false, platform: 'browser', define: {'process.env.NODE_ENV':'"production"'} }).outputFiles[0].text;

function findHost(node) {
  if (node.attributes?.includes('gupy-ai-helper-root')) return node;
  for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) { const found = findHost(child); if (found) return found; }
}

test('Chrome MV3 integration (isolated profile, intercepted site and **/v1/chat/completions mock)', {timeout: 120000}, async t => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chrome', headless: true, args: ['--enable-unsafe-extension-debugging'],
    ignoreDefaultArgs: ['--disable-extensions'], viewport: {width: 1440, height: 1000}
  });
  try {
    const cdpBrowser = await context.browser().newBrowserCDPSession();
    const workerReady = context.waitForEvent('serviceworker', {timeout: 20000});
    const extension = await cdpBrowser.send('Extensions.loadUnpacked', {path: root});
    const worker = await workerReady;

    // Mock route **/v1/chat/completions at Playwright context level and Service Worker fetch level
    await context.route('**/v1/chat/completions', async route => {
      const reqBody = JSON.parse(route.request().postData() || '{}');
      const userContent = JSON.parse(reqBody.messages?.[1]?.content || '{}');
      const questions = userContent.job?.questions || [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                match_score: 70,
                match_reason: 'Resultado simulado via mock **/v1/chat/completions.',
                key_skills_found: ['JavaScript', 'React'],
                missing_skills: [],
                answers: questions.map(q => ({
                  field_label_hint: q.field_label_hint,
                  fato_base_curriculo: 'Experiência comprovada em JavaScript e React no currículo.',
                  rascunho_resposta: 'Resposta fictícia para teste local.'
                }))
              })
            }
          }]
        })
      });
    });

    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        apiKey: 'sk-test-fixture-not-a-real-key',
        masterProfile: {
          perfil: { titulo: 'Desenvolvedor Full Stack', senioridade: 'pleno', resumo: 'Perfil fictício exclusivamente para teste local.' },
          palavras_chave_busca: ['Desenvolvedor', 'React'],
          hard_skills: ['JavaScript', 'React'],
          projetos_e_experiencias: [{ titulo: 'Dev', organizacao: 'Local', descricao: 'Web dev', tecnologias: ['JavaScript', 'React'] }],
          formacao: [{ curso: 'TI', instituicao: 'Local' }],
          preferencias_vaga: { modalidades: ['remoto'] }
        }
      });
      globalThis.fetch = async (url, options) => {
        if (String(url).includes('/v1/chat/completions')) {
          const body = JSON.parse(options.body);
          const data = JSON.parse(body.messages[1].content);
          globalThis.lastTestPayload = data;
          if (data.jobs) {
            return {
              ok: true,
              json: async () => ({
                choices: [{
                  finish_reason: 'stop',
                  message: {
                    content: JSON.stringify({
                      evaluations: data.jobs.map(j => ({
                        job_id: j.job_id,
                        semantic_score: 88,
                        fato_base_curriculo: 'Projetos com JavaScript e React',
                        match_reason: 'Alta compatibilidade técnica e semântica.'
                      }))
                    })
                  }
                }]
              })
            };
          }
          return {
            ok: true,
            json: async () => ({
              choices: [{
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    match_score: 70,
                    match_reason: 'Resultado simulado. Somente teste local.',
                    key_skills_found: ['JavaScript'],
                    missing_skills: [],
                    answers: data.job.questions.map(q => ({
                      field_label_hint: q.field_label_hint,
                      fato_base_curriculo: 'Experiência com JavaScript no perfil.',
                      rascunho_resposta: 'Resposta fictícia para teste local.'
                    }))
                  })
                }
              }]
            })
          };
        }
        if (String(url).includes('portal.api.gupy.io')) {
          return {
            ok: true,
            json: async () => ({
              data: [{ id: 501, name: 'Dev React', careerPageName: 'GupyCo', workplaceType: 'remoto', jobUrl: 'https://fixture.gupy.io/jobs/1', description: 'React e JavaScript.' }]
            })
          };
        }
        return { ok: true, headers: { get: () => 'text/html' }, text: async () => '' };
      };
    });

    let html;
    let outbound = 0;
    await context.route('**/*', route => {
      const reqUrl = route.request().url();
      if (reqUrl.startsWith(`chrome-extension://${extension.id}/`)) return route.continue();
      if (reqUrl.includes('/v1/chat/completions')) return route.fallback();
      if (reqUrl === 'https://fixture.gupy.io/favicon.ico') return route.fulfill({status:204});
      if (reqUrl === 'https://fixture.gupy.io/react.js') return route.fulfill({contentType:'text/javascript',body:bundle});
      if (/^https:\/\/fixture\.gupy\.io\/jobs\//.test(reqUrl) && route.request().method() === 'GET') return route.fulfill({contentType:'text/html',body:html});
      outbound++;
      return route.abort();
    });

    const page = context.pages()[0];
    const cdp = await context.newCDPSession(page);
    async function widget(fn, ...args) {
      const {root:dom} = await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
      const host = findHost(dom);
      assert.ok(host?.shadowRoots?.[0], 'Real extension widget must exist');
      const {object} = await cdp.send('DOM.resolveNode',{nodeId:host.shadowRoots[0].nodeId});
      const response = await cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:true,awaitPromise:true});
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
      return response.result.value;
    }
    async function fixture(content) {
      html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body><main><h1>Vaga de teste</h1><section data-testid="job-description">${description}</section>${content}</main></body></html>`;
      await page.goto('https://fixture.gupy.io/jobs/1');
      await page.locator('#gupy-ai-helper-root').waitFor();
      await page.waitForTimeout(500);
    }
    const labels = () => widget(function(){return [...this.querySelectorAll('.gupy-ai-helper-questions p')].map(e=>e.textContent)});
    async function analyze() {
      await widget(function(){this.querySelector('.gupy-ai-helper-consent input').click(); [...this.querySelectorAll('button')].find(b=>b.textContent==='Analisar').click()});
      for(let i=0;i<30;i++) {
        if(await widget(function(){return this.querySelector('.gupy-ai-helper-results h2')!==null})) return;
        await page.waitForTimeout(100);
      }
      assert.fail(await widget(function(){return this.querySelector('.gupy-ai-helper-status').textContent}));
    }
    const fill = () => widget(function(){[...this.querySelectorAll('button')].find(b=>b.textContent==='Preencher respostas selecionadas').click()});

    await t.test('recognizes accented labels on text inputs and dispatches full event chain (focusin, input, change, blur, focusout)', async () => {
      await fixture('<label for="experience">Experiência profissional</label><input id="experience" type="text"><script>window.events=[];for(const type of ["focusin","input","change","blur","focusout"])document.querySelector("input").addEventListener(type,e=>window.events.push({type:e.type,value:e.target.value}))</script>');
      assert.deepEqual(await labels(), ['Experiência profissional']);
      await analyze(); await fill(); await page.waitForTimeout(300);
      const events = await page.evaluate(()=>window.events);
      for (const type of ['focusin','input','change','blur','focusout']) {
        assert.ok(events.some(e=>e.type===type), `Event ${type} must be dispatched`);
      }
      assert.ok(events.some(e=>e.type==='input' && e.value==='Resposta fictícia para teste local.'));
    });

    await t.test('supports contenteditable rich text fields', async () => {
      await fixture('<label id="rt-lbl">Conte sua experiência com projetos</label><div contenteditable="true" aria-labelledby="rt-lbl" id="rich-editor"></div>');
      assert.deepEqual(await labels(), ['Conte sua experiência com projetos']);
      await analyze(); await fill(); await page.waitForTimeout(300);
      assert.equal(await page.locator('#rich-editor').textContent(), 'Resposta fictícia para teste local.');
    });

    await t.test('excludes disabled fieldsets and aria-disabled groups', async () => {
      await fixture('<fieldset disabled><label>Conte sua trajetória<textarea></textarea></label></fieldset><div aria-disabled="true"><label>Descreva seus objetivos<textarea></textarea></label></div>');
      assert.deepEqual(await labels(), []);
    });

    await t.test('uses local question heading instead of generic placeholder', async () => {
      await fixture('<div><h3>Por que deseja trabalhar aqui?</h3><div><textarea placeholder="Digite sua resposta"></textarea></div></div><div><h3>Conte suas realizações</h3><textarea placeholder="Digite sua resposta"></textarea></div>');
      assert.deepEqual(await labels(), ['Por que deseja trabalhar aqui?', 'Conte suas realizações']);
    });

    await t.test('keeps professional database questions but excludes bank-account questions', async () => {
      await fixture('<label>Qual sua experiência com banco de dados?<textarea></textarea></label><label>Informe seu banco e conta bancária<textarea></textarea></label>');
      assert.deepEqual(await labels(), ['Qual sua experiência com banco de dados?']);
    });

    await t.test('React controlled values, blur and preserving existing text', async () => {
      await fixture('<div id="react"></div><script src="/react.js"></script>');
      await page.locator('#first').waitFor();
      await analyze();
      await fill();
      await page.waitForTimeout(800);
      const state = JSON.parse(await page.locator('#react-state').textContent());
      assert.equal(state.values.first, 'Resposta fictícia para teste local.');
      assert.equal(state.values.second, 'Resposta fictícia para teste local.');
      assert.equal(state.values.existing, 'Texto já escrito');
      assert.ok(state.blurs >= 2);
      assert.equal(await page.evaluate(()=>Boolean(window.submitted)), false);
      assert.ok(!(await worker.evaluate(()=>JSON.stringify(globalThis.lastTestPayload))).includes('Texto já escrito'));
      await fs.mkdir(path.join(root,'test-results'),{recursive:true});
      await page.screenshot({path:path.join(root,'test-results/react-filled.png'),fullPage:true});
    });

    await t.test('does not overwrite a value inserted by a focus handler', async () => {
      await fixture('<label>Conte sua trajetória<textarea id="focus-fill"></textarea></label><script>document.querySelector("textarea").addEventListener("focus",e=>{e.target.value="Texto recuperado pelo site"})</script>');
      await analyze(); await fill(); await page.waitForTimeout(300);
      assert.equal(await page.locator('#focus-fill').inputValue(), 'Texto recuperado pelo site');
    });

    await t.test('invalidates results on SPA route or field replacement', async () => {
      await fixture('<label>Conte sua trajetória<textarea id="answer"></textarea></label>');
      await analyze();
      await page.evaluate(()=>document.querySelector('#answer').replaceWith(document.querySelector('#answer').cloneNode()));
      await page.waitForTimeout(600);
      assert.equal(await widget(function(){return this.querySelector('.gupy-ai-helper-results').children.length}),0);
      await analyze();
      await page.evaluate(()=>history.pushState({},'', '/jobs/2'));
      await page.waitForTimeout(1400);
      assert.equal(await widget(function(){return this.querySelector('.gupy-ai-helper-results').children.length}),0);
      assert.equal(await page.locator('#answer').inputValue(),'');
    });

    await t.test('extracts Gupy job sections without process stages or employer marketing', async () => {
      await fixture(`<section><h2 data-testid="section-Descrição da vaga-title">Descrição da vaga</h2><p>${description}</p></section><section><h2 data-testid="section-Responsabilidades e atribuições-title">Responsabilidades e atribuições</h2><p>Desenvolver aplicações acessíveis.</p></section><section><h2 data-testid="section-Requisitos e qualificações-title">Requisitos e qualificações</h2><p>Experiência com React.</p></section><section><h2 data-testid="section-Etapas do processo-title">Etapas do processo</h2><p>Entrevista técnica.</p></section><section><h2 data-testid="section-Empresa-title">Sobre a empresa</h2><p>Texto institucional.</p></section>`);
      const jd = await widget(function(){return this.querySelector('textarea').value});
      assert.ok(jd.includes('Desenvolver aplicações acessíveis.'));
      assert.ok(jd.includes('Experiência com React.'));
      assert.ok(!jd.includes('Entrevista técnica.'));
      assert.ok(!jd.includes('Texto institucional.'));
    });

    await t.test('respects readonly, hidden and maxlength changes after analysis', async () => {
      await fixture('<label>Conte sua trajetória<textarea id="limited"></textarea></label><label>Descreva seus objetivos<textarea readonly></textarea></label><div hidden><label>Conte suas realizações<textarea></textarea></label></div>');
      assert.deepEqual(await labels(), ['Conte sua trajetória']);
      await analyze();
      await page.evaluate(()=>document.querySelector('#limited').maxLength=5);
      await fill();
      assert.equal(await page.locator('#limited').inputValue(),'');
      assert.equal(await widget(function(){return this.querySelector('.gupy-ai-helper-results').children.length}),0);
    });

    await t.test('In-page Copilot in open Shadow DOM specializes on active job, displays Match Score & skill tags, and supports session close (✕)', async () => {
      await fixture('<label>Conte sua trajetória<textarea></textarea></label>');
      const isOpenShadow = await widget(function() {
        return this.mode === 'open';
      });
      assert.equal(isOpenShadow, true, 'Shadow DOM must be open for Playwright testability');

      // Verify redundant tabs were removed and footer link to Radar/Currículo is present
      const uiCheck = await widget(function() {
        const buttons = [...this.querySelectorAll('button')].map(b => b.textContent);
        const scoreBadge = this.querySelector('.gupy-ai-helper-score-badge')?.textContent || '';
        const matchedTags = [...this.querySelectorAll('.gupy-ai-helper-tag-match')].map(t => t.textContent);
        const footerBtn = this.querySelector('.gupy-ai-helper-footer-link')?.textContent || '';
        return { buttons, scoreBadge, matchedTags, footerBtn };
      });
      assert.ok(!uiCheck.buttons.includes('Meu Currículo'), 'Redundant Meu Currículo tab must not exist in content script');
      assert.match(uiCheck.scoreBadge, /\d+% Match/);
      assert.ok(uiCheck.matchedTags.some(t => t.includes('JavaScript')));
      assert.equal(uiCheck.footerBtn, 'Abrir Radar de Vagas & Gerenciar Currículo');

      // Test Close ("✕") button persists across SPA route changes in the same session
      await widget(function() {
        this.querySelector('.gupy-ai-helper-close-btn').click();
      });
      assert.equal(await widget(function() { return this.querySelector('.gupy-ai-helper-panel').hidden; }), true);
      await page.evaluate(() => history.pushState({}, '', '/jobs/99'));
      await page.waitForTimeout(1200);
      assert.equal(await widget(function() { return this.querySelector('.gupy-ai-helper-panel').hidden; }), true);
    });

    await t.test('options.html renders Radar de Vagas, Meu Currículo, and KPI export button', async () => {
      const extPage = await context.newPage();
      await extPage.goto(`chrome-extension://${extension.id}/options.html`);
      await extPage.locator('#run-discovery-btn').click();
      await extPage.waitForTimeout(500);
      const headline = await extPage.locator('#discovery-headline').textContent();
      assert.match(headline || '', /Encontramos \d+ vagas compatíveis com o seu currículo/);
      await extPage.locator('#tab-resume-btn').click();
      const exportBtnVisible = await extPage.locator('#export-telemetry-btn').isVisible();
      assert.equal(exportBtnVisible, true, 'KPI export button must be visible on Meu Currículo tab');
      await extPage.close();
    });

    assert.equal(outbound, 0, 'No network request may escape the local test fixture');
  } finally {await context.close();}
});
