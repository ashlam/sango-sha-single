const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8000/?auto=1&fast=1', { waitUntil: 'networkidle' });
  // 自动对局，等结束
  for (let i = 0; i < 400; i++) {
    const over = await p.evaluate(() => G.over);
    if (over) break;
    await p.waitForTimeout(150);
  }
  await p.waitForTimeout(1200);
  const st = await p.evaluate(() => ({
    over: G.over, turn: G.turn,
    modal: !document.getElementById('modal').classList.contains('hidden'),
    title: (document.querySelector('.result-title') || {}).textContent || '',
    players: G.players.map(x => `${x.general}(${x.hp}/${x.maxHp})${x.alive ? '' : '亡'}`),
  }));
  console.log(JSON.stringify(st, null, 1));
  await p.waitForTimeout(900);
  await p.screenshot({ path: 'tools/shot-result.png' });
  console.log('ERRORS:', errors.length ? errors.slice(0,5) : 'none');
  await b.close();
})();
