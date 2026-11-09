const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => console.log('PAGEERROR:', e.message, (e.stack||'').split('\n').slice(0,3).join(' | ')));
  p.on('console', m => { if (m.type()==='error') console.log('CONSOLE:', m.text()); });
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
  // 强塞一张装备牌
  const r = await p.evaluate(() => {
    const me = G.players[0];
    const mk = (id, suit, num) => ({ uid: Date.now() + Math.random(), id, suit, num, name: CARD_INFO[id].name });
    const eq = mk('zhuge', 'd', 9);
    me.hand.push(eq);
    UI.render();
    // 检查可选性
    const el = [...document.querySelectorAll('#handArea .card')].find(e2 => +e2.dataset.uid === eq.uid || e2.dataset.uid === String(eq.uid));
    return {
      reason: cardPlayReason(eq),
      selectable: cardSelectable(eq),
      dimmed: el ? el.classList.contains('dimmed') || el.classList.contains('disabled') : 'not-found',
    };
  });
  console.log('装备牌状态:', JSON.stringify(r));
  // 实际点击试试
  const r2 = await p.evaluate(() => {
    const me = G.players[0];
    const eq = me.hand.find(c => c.id === 'zhuge');
    onCardClick(eq);
    return { sel: UI.sel.cards.length, prompt: document.getElementById('actionPrompt').textContent };
  });
  console.log('点击后:', JSON.stringify(r2));
  await p.waitForTimeout(300);
  const r3 = await p.evaluate(() => ({ canConfirm: !document.getElementById('btnConfirm').disabled }));
  console.log('确认可用:', JSON.stringify(r3));
  await p.click('#btnConfirm'); await p.waitForTimeout(400);
  console.log('出牌后立即:', JSON.stringify(await p.evaluate(() => ({ weapon: G.players[0].equip.weapon && G.players[0].equip.weapon.name, log: G.log.slice(-2).map(l=>l.text) }))));
  await p.waitForTimeout(1500);
  console.log('1.5秒后:', JSON.stringify(await p.evaluate(() => ({ weapon: G.players[0].equip.weapon && G.players[0].equip.weapon.name, log: G.log.slice(-3).map(l=>l.text) }))));
  await b.close();
})();
