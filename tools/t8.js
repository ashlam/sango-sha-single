const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://127.0.0.1:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.selectOption('#selCount', '8');
  await p.click('#btnStart');
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'tools/shot8-pick.png' });
  await p.click('.hero .h-name');
  await p.waitForTimeout(800);
  const st = await p.evaluate(() => ({
    modal: !document.getElementById('modal').classList.contains('hidden'),
    seats: document.querySelectorAll('.seat').length,
    players: G.players.length,
    ids: G.players.map(x => x.identity).join(','),
    classes: document.getElementById('seats').className,
    cards: [...document.querySelectorAll('.seat .gcard')].map(el => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    }),
    overflow: G.players.filter(x => x.seat !== 0).length,
  }));
  console.log(JSON.stringify(st, null, 1));
  console.log('errors:', errs.slice(0, 6));
  await p.screenshot({ path: 'tools/shot8.png' });
  await b.close();
})();
