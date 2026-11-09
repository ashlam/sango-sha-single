const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.click('#btnStart'); await p.waitForTimeout(300);
  await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(300);
  await p.evaluate(() => {
    setInterval(() => {
      if (!UI.req || UI.req.kind === 'play') return;
      const pl = UI.player, r = UI.req, fn = UI.resolve;
      Promise.resolve(AI.decide(pl, r)).then(res => { UI.req=null; UI.player=null; UI.resolve=null; document.getElementById('modal').classList.add('hidden'); if(fn)fn(res); });
    }, 80);
  });
  for (let i = 0; i < 200; i++) { if (await p.evaluate(() => UI.req && UI.req.kind === 'play')) break; await p.waitForTimeout(120); }
  await p.waitForTimeout(400);
  // 选一张杀看距离徽章
  const idx = await p.evaluate(() => G.players[0].hand.findIndex(c => ['sha','huosha','leisha'].includes(c.id)));
  if (idx >= 0) await p.evaluate(i => document.querySelectorAll('#handArea .card')[i].click(), idx);
  await p.waitForTimeout(350);
  await p.screenshot({ path: 'tools/v-game.png' });
  console.log('距离徽章:', await p.evaluate(() => [...document.querySelectorAll('.seat .dist-tag')].filter(d=>d.style.display!=='none').map(d=>d.textContent)));
  console.log('检视入口数:', await p.evaluate(() => document.querySelectorAll('[data-inspect]').length));
  console.log('ⓘ 按钮数:', await p.evaluate(() => document.querySelectorAll('.gc-info, #btnPromptInfo').length));
  console.log('ERRORS:', errors.length ? errors.slice(0,5) : 'none');
  await b.close();
})();
