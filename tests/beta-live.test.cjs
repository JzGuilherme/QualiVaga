const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { selectStartPage } = require('./open-auth-browser.cjs');
const { loadLocalEnv } = require('./load-env.cjs');

const root = path.join(__dirname, '..');

test('Beta 1: Preserves restored Gupy application tab in authenticated session profile (.test-profile-auth)', async () => {
  const navigations = [];
  const pages = [
    { url: () => 'about:blank', goto: async target => navigations.push(target) },
    { url: () => 'https://empresa.gupy.io/candidates/jobs/999/apply', goto: async target => navigations.push(target) }
  ];
  const fakeContext = {
    pages: () => pages,
    newPage: async () => {
      const p = { url: () => 'about:blank', goto: async target => navigations.push(target) };
      pages.push(p);
      return p;
    }
  };
  const selected = await selectStartPage(fakeContext);
  assert.equal(selected, pages[1]);
  assert.deepEqual(navigations, []);
});

test('Beta 2: Live Network Adapter Telemetry Audit inside Real Chromium MV3 Service Worker (Playwright)', { timeout: 90000 }, async () => {
  const envConfig = loadLocalEnv(root);
  const personaRaw = fs.readFileSync(envConfig.resumePath, 'utf8');
  const persona = JSON.parse(personaRaw);

  const context = await chromium.launchPersistentContext('', {
    channel: 'chrome',
    headless: envConfig.headless,
    args: ['--enable-unsafe-extension-debugging'],
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1440, height: 900 }
  });

  try {
    const cdpBrowser = await context.browser().newBrowserCDPSession();
    const workerReady = context.waitForEvent('serviceworker', { timeout: 20000 });
    const extension = await cdpBrowser.send('Extensions.loadUnpacked', { path: root });
    await workerReady;

    // Open extension options page to trigger DISCOVER_JOBS through real MV3 Service Worker & host_permissions
    const extPage = await context.newPage();
    await extPage.goto(`chrome-extension://${extension.id}/options.html`, { waitUntil: 'domcontentloaded' });

    const t0 = Date.now();
    const discoveryRes = await extPage.evaluate(async ({ resumeData, apiKey }) => {
      await chrome.storage.local.set({
        masterProfile: resumeData,
        ...(apiKey ? { apiKey } : {})
      });
      return await chrome.runtime.sendMessage({
        type: 'DISCOVER_JOBS',
        payload: { resume: resumeData }
      });
    }, { resumeData: persona, apiKey: envConfig.apiKey });
    const durationMs = Math.max(1, Date.now() - t0);

    assert.equal(discoveryRes.ok, true, discoveryRes.error || 'DISCOVER_JOBS must succeed in MV3 Service Worker');
    const discovery = discoveryRes.data;

    const statuses = discovery.platformStatuses || {};
    for (const plat of ['Gupy', 'LinkedIn', 'InfoJobs']) {
      const st = statuses[plat];
      assert.ok(st, `Platform status for ${plat} must be reported`);
      assert.equal(typeof st.latencyMs, 'number');
      assert.ok(Array.isArray(st.jobs));
    }

    // Check if the environment is an offline sandbox
    const allOffline = ['Gupy', 'LinkedIn', 'InfoJobs'].every(p =>
      String(statuses[p]?.error || '').startsWith('OFFLINE_SANDBOX')
    );

    if (!allOffline) {
      // In an online environment, at least 1 platform (and specifically Gupy or LinkedIn) must extract real jobs > 0
      assert.ok(
        discovery.totalFound > 0,
        `Expected > 0 live jobs extracted across Gupy/LinkedIn/InfoJobs in Chromium, got 0. Errors: ${JSON.stringify(statuses)}`
      );
    }

    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'test-results/beta-live-kpis.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          environment: allOffline ? 'OFFLINE_SANDBOX' : 'ONLINE_CHROMIUM_MV3',
          resumeUsed: path.basename(envConfig.resumePath),
          time_to_first_value_ms: durationMs,
          totalJobsFound: discovery.totalFound,
          platformCounts: discovery.platformCounts,
          platformStatuses: discovery.platformStatuses,
          topJobs: (discovery.jobs || []).slice(0, 10).map(j => ({
            id: j.id,
            platform: j.platform,
            title: j.title,
            company: j.company,
            location: j.location,
            workplaceType: j.workplaceType,
            matchScore: j.matchScore,
            deterministicScore: j.deterministicScore,
            matchedSkills: j.matchedSkills,
            missingSkills: j.missingSkills,
            url: j.url
          }))
        },
        null,
        2
      )
    );
  } finally {
    await context.close();
  }
});
