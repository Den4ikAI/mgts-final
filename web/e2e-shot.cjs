// Usage: node shot.cjs <out-dir> <login> <path...>   — logs in through the UI, screenshots each path.
const { chromium } = require('playwright');
(async () => {
  const [out, login, ...paths] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell' });
  const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
  await p.goto((process.env.BASE || 'http://localhost:8080') + '/login');
  await p.waitForSelector('input[type=password]', { timeout: 10000 });
  const inputs = await p.$$('input');
  await inputs[0].fill(login || 'dispatcher');
  await p.fill('input[type=password]', 'mgts-demo');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.ux-side', { timeout: 15000 });
  for (const path of paths) {
    await p.goto((process.env.BASE || 'http://localhost:8080') + path);
    await p.waitForSelector('.ux-side', { timeout: 15000 });
    await p.waitForTimeout(2500);
    const name = path.replace(/[^a-z0-9]+/gi, '_') || 'root';
    await p.screenshot({ path: `${out}/ui${name}.png`, fullPage: false });
    console.log('shot', path);
  }
  console.log('errors:', JSON.stringify([...new Set(errors)].slice(0, 10)));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
