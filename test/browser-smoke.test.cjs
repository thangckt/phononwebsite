const assert = require('assert');
const { spawn } = require('child_process');

let playwright = null;
try {
  playwright = require('playwright');
} catch (err) {
  // Playwright is optional for now.
}

const runBrowserSmoke = process.env.PLAYWRIGHT_SMOKE === '1' && !!playwright;
const describeBrowser = runBrowserSmoke ? describe : describe.skip;

describeBrowser('Browser smoke (optional)', function () {
  this.timeout(30000);

  const port = 8123;
  const baseUrl = `http://127.0.0.1:${port}`;
  let server;

  before(function (done) {
    server = spawn('python3', ['-m', 'http.server', String(port)], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });

    setTimeout(done, 800);
  });

  after(function () {
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
  });

  it('loads phonon.html with no page errors', async function () {
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message || String(error));
    });

    await page.goto(`${baseUrl}/phonon.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#highcharts');

    await browser.close();

    assert.equal(pageErrors.length, 0, `Browser page errors:\n${pageErrors.join('\n')}`);
  });

  it('loads exciton.html with no page errors', async function () {
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message || String(error));
    });

    await page.goto(`${baseUrl}/exciton.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#highcharts');

    await browser.close();

    assert.equal(pageErrors.length, 0, `Browser page errors:\n${pageErrors.join('\n')}`);
  });
});

if (!runBrowserSmoke) {
  describe('Browser smoke (optional)', function () {
    it.skip('set PLAYWRIGHT_SMOKE=1 and install playwright to run');
  });
}
