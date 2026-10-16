// Read-only inspection of the dedicated manual-login profile; never prints values.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const { endpoint } = JSON.parse(await fs.readFile(path.join(root, 'test-results/auth-session.json'), 'utf8'));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Only the local test endpoint is allowed');
  const browser = await chromium.connectOverCDP(endpoint);
  const pages = browser.contexts()[0].pages();
  let targets = pages.filter(page => { try { return new URL(page.url()).hostname.endsWith('.gupy.io'); } catch { return false; } });
  if (process.argv[2]) {
    const url = new URL(process.argv[2]);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.gupy.io')) throw new Error('Expected a Gupy HTTPS URL');
    if (targets.length !== 1) throw new Error('Expected exactly one Gupy tab before navigation');
    await targets[0].goto(url.href, { waitUntil: 'domcontentloaded' });
  }
  if (!targets.length) throw new Error('No Gupy tab in the test profile');
  const results = [];
  for (const page of targets) {
    // content_scripts run at document_idle; DOMContentLoaded alone is too early.
    await page.locator('#gupy-ai-helper-root').waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
    const report = await page.evaluate(() => {
      const text = node => {
        if (!node) return '';
        const clone = node.cloneNode(true);
        clone.querySelectorAll('input,textarea,select,output,[contenteditable]').forEach(el => el.remove());
        return clone.textContent.trim().slice(0, 300);
      };
      return {
        origin: location.origin, path: location.pathname, title: document.title,
        headings: [...document.querySelectorAll('h1,h2')].filter(el => el.getClientRects().length).map(text).slice(0, 12),
        fields: [...document.querySelectorAll('input,textarea,[contenteditable="true"]')].map(el => ({
          tag: el.tagName, type: el.type || '', role: el.getAttribute('role'),
          label: [...(el.labels || [])].map(text).join(' ') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '',
          visible: el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
          disabled: el.matches(':disabled') || Boolean(el.closest('[aria-disabled="true"]')),
          hasValue: Boolean((el.value || el.textContent || '').trim())
        })),
        widgetPresent: Boolean(document.getElementById('gupy-ai-helper-root'))
      };
    });
    results.push(report);
  }
  console.log(JSON.stringify(results, null, 2));
  // Disconnect this short-lived inspector without closing the user's test window.
  process.exit(0);
})().catch(error => { console.error(error.message); process.exit(1); });
