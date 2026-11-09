const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (let run = 0; run < 2; run++) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errors = [];
    p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('http://127.0.0.1:8000/?auto=1&fast=1&players=8', { waitUntil: 'networkidle' });
    for (let i = 0; i < 600; i++) {
      if (await p.evaluate(() => G.over)) break;
      await p.waitForTimeout(150);
    }
    await p.waitForTimeout(1000);
    const st = await p.evaluate(() => ({
      over: G.over, turn: G.turn, n: G.players.length,
      title: (document.querySelector('.result-title') || {}).textContent || '(无结算)',
      alive: G.players.filter(x => x.alive).length,
      seats: document.querySelectorAll('.seat').length,
    }));
    console.log('run' + run, JSON.stringify(st), 'ERR:', errors.length ? errors.slice(0, 3) : 'none');
    if (run === 1) await p.screenshot({ path: 'tools/shot8-result.png' });
    await p.close();
  }
  await b.close();
})();
