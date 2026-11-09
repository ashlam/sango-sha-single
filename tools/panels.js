const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  // 规则弹窗
  await p.click('#btnRule'); await p.waitForTimeout(300);
  await p.screenshot({ path: 'tools/shot-rule.png' });
  console.log('规则弹窗:', await p.evaluate(() => !document.getElementById('modal').classList.contains('hidden')));
  await p.click('#mRuleOk'); await p.waitForTimeout(200);

  await p.click('#btnStart'); await p.waitForTimeout(250);
  await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(200);
  await p.evaluate(() => { setInterval(() => { if (!UI.req || UI.req.kind === 'play') return; const pl=UI.player,r=UI.req,fn=UI.resolve; Promise.resolve(AI.decide(pl,r)).then(res=>{UI.req=null;UI.player=null;UI.resolve=null;document.getElementById('modal').classList.add('hidden');if(fn)fn(res);}); }, 80); });
  for (let i = 0; i < 200; i++) { if (await p.evaluate(() => UI.req && UI.req.kind === 'play')) break; await p.waitForTimeout(120); }

  // 战报
  await p.click('#btnLog'); await p.waitForTimeout(400);
  await p.screenshot({ path: 'tools/shot-log.png' });
  console.log('战报面板:', await p.evaluate(() => !document.getElementById('logPanel').classList.contains('hidden')), '条目数:', await p.evaluate(() => document.querySelectorAll('#logList .lg').length));
  await p.click('#btnCloseLog'); await p.waitForTimeout(200);

  // 菜单
  await p.click('#btnMenu'); await p.waitForTimeout(300);
  await p.screenshot({ path: 'tools/shot-menu.png' });
  console.log('菜单弹窗:', await p.evaluate(() => !document.getElementById('modal').classList.contains('hidden')));
  await p.click('#mClose'); await p.waitForTimeout(200);

  // 技能按钮（选一张杀）
  const hasSha = await p.evaluate(() => G.players[0].hand.some(c => ['sha','huosha','leisha'].includes(c.id)));
  if (hasSha) {
    await p.evaluate(() => {
      const h = G.players[0].hand;
      const i = h.findIndex(c => ['sha','huosha','leisha'].includes(c.id));
      document.querySelectorAll('#handArea .card')[i].click();
    });
    await p.waitForTimeout(300);
    console.log('技能按钮数:', await p.evaluate(() => document.querySelectorAll('#skillBar .skill-chip').length));
    await p.screenshot({ path: 'tools/shot-skill.png' });
  }
  console.log('ERRORS:', errors.length ? errors.slice(0,5) : 'none');
  await b.close();
})();
