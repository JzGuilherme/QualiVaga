// Manual-login test window. No personal Chrome profile or credentials are copied.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs/promises');

async function selectStartPage(context) {
  const pages = context.pages();
  const restored = pages.find(page => {
    try {
      const url = new URL(page.url());
      return url.protocol === 'https:' && (url.hostname === 'gupy.io' || url.hostname.endsWith('.gupy.io'));
    } catch { return false; }
  });
  // Never navigate or reload a restored application: it may contain an unsaved draft.
  if (restored) return restored;
  const page = pages.find(page => page.url() === 'about:blank') || await context.newPage();
  await page.goto('https://portal.gupy.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const profile = path.join(root, '.test-profile-auth');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, viewport: null,
    args: ['--enable-unsafe-extension-debugging', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'],
    ignoreDefaultArgs: ['--disable-extensions']
  });
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: root });
  const port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local debugging port');
  await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
  await fs.writeFile(path.join(root, 'test-results/auth-session.json'), JSON.stringify({ endpoint: `http://127.0.0.1:${port}` }));
  const page = await selectStartPage(context);
  console.log(JSON.stringify({ ready: true, title: await page.title(), origin: new URL(page.url()).origin }));
  await new Promise(resolve => context.once('close', resolve));
}

module.exports = { selectStartPage };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
