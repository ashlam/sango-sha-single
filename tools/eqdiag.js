const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => console.log('PAGEERROR:', e.message, (e.stack||'').split('\n').slice(0,4).join(' | ')));
  p.on('console', m => { if (m.type()==='error') console.log('CONSOLE:', m.text()); });
  p.on('framenavigated', f => { if (f === p.mainFrame()) console.log('!! 页面导航/刷新'); });
  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.evaluate(() => { window.__TOKEN = Math.random(); });
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
  console.log('到达出牌阶段, token:', await p.evaluate(() => window.__TOKEN));
  const r = await p.evaluate(() => {
    const me = G.players[0];
    const mk = (id, suit, num) => ({ uid: Date.now() + Math.random(), id, suit, num, name: CARD_INFO[id].name });
    const eq = mk('zhuge', 'd', 9);
    me.hand.push(eq);
    UI.render();
    onCardClick(eq);
    return { sel: UI.sel.cards.length };
  });
  console.log('选中:', JSON.stringify(r));
  await p.click('#btnConfirm'); await p.waitForTimeout(600);
  console.log(JSON.stringify(await p.evaluate(() => ({
    token: window.__TOKEN,
    weapon: G.players[0].equip.weapon && G.players[0].equip.weapon.name,
    log: G.log.slice(-3).map(l=>l.text),
  }))));
  await b.close();
})();
