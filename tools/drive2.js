const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await page.click('#btnStart'); await page.waitForTimeout(250);
  await page.click('.hero:nth-child(1) .h-name'); await page.waitForTimeout(200);

  // 打开开关并接管所有非出牌请求
  await page.evaluate(() => {
    window.__AUTO_HANDLE = true;
    window.__HANDLE = function () {
      if (!UI.req || UI.req.kind === 'play') return false;
      const p = UI.player, r = UI.req, fn = UI.resolve;
      Promise.resolve(AI.decide(p, r)).then(res => {
        UI.req = null; UI.player = null; UI.resolve = null;
        document.getElementById('modal').classList.add('hidden');
        if (fn) fn(res);
      });
      return true;
    };
    setInterval(() => window.__HANDLE(), 80);
  });

  let got = false;
  for (let i = 0; i < 200; i++) {
    const st = await page.evaluate(() => UI.req && UI.req.kind);
    if (st === 'play') { got = true; break; }
    if (await page.evaluate(() => G.over)) break;
    await page.waitForTimeout(120);
  }
  console.log('到达玩家出牌阶段:', got);
  if (!got) { console.log(await page.evaluate(() => ({ over: G.over, cur: G.current, phase: G.phase }))); await browser.close(); return; }

  await page.screenshot({ path: 'tools/shot-play.png' });
  console.log('手牌:', await page.evaluate(() => G.players[0].hand.map(c => c.name)));

  const idx = await page.evaluate(() => G.players[0].hand.findIndex(c => ['sha','huosha','leisha'].includes(c.id)));
  if (idx < 0) { console.log('本回合无杀，改用其它牌测试'); }
  const testIdx = idx >= 0 ? idx : 0;
  await page.evaluate(i => document.querySelectorAll('#handArea .card')[i].click(), testIdx);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'tools/shot-sel.png' });
  console.log('提示:', await page.evaluate(() => document.getElementById('actionPrompt').textContent));
  console.log('可选目标:', await page.evaluate(() => [...document.querySelectorAll('.seat.selectable')].map(s => s.dataset.seat)));

  const t = await page.$('.seat.selectable');
  if (t) { await t.click(); await page.waitForTimeout(250); }
  await page.screenshot({ path: 'tools/shot-target.png' });
  const can = await page.evaluate(() => !document.getElementById('btnConfirm').disabled);
  console.log('确定可用:', can);
  if (can) {
    await page.click('#btnConfirm');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'tools/shot-after.png' });
    console.log('出牌后:', await page.evaluate(() => ({ phase: G.phase, req: UI.req && UI.req.kind, log: G.log.slice(-3).map(l => l.text) })));
  }
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})();
