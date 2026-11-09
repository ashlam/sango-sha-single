const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.click('#btnStart'); await p.waitForTimeout(250);
  await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(200);
  // 强制玩家为关羽
  await p.evaluate(() => {
    const g = GENERALS.find(x => x.id === 'guanyu');
    assignGeneral(G.players[0], g);
    const mk = (id, suit, num) => ({ uid: Date.now() + Math.random(), id, suit, num, name: CARD_INFO[id].name });
    G.players[0].hand.push(mk('jiu', 'd', 3), mk('nanman', 'h', 7), mk('sha', 's', 10), mk('wuxie', 'c', 11));
    UI.render();
    setInterval(() => { if (!UI.req || UI.req.kind === 'play') return; const pl=UI.player,r=UI.req,fn=UI.resolve; Promise.resolve(AI.decide(pl,r)).then(res=>{UI.req=null;UI.player=null;UI.resolve=null;document.getElementById('modal').classList.add('hidden');if(fn)fn(res);}); }, 80);
  });
  for (let i = 0; i < 200; i++) { if (await p.evaluate(() => UI.req && UI.req.kind === 'play')) break; await p.waitForTimeout(120); }
  await p.waitForTimeout(300);

  // 选一张红色牌 → 武圣应可当杀用
  const res = await p.evaluate(() => {
    const h = G.players[0].hand;
    const i = h.findIndex(c => (c.suit === 'd' || c.suit === 'h') && c.id !== 'sha');
    if (i < 0) return { err: 'no red card' };
    document.querySelectorAll('#handArea .card')[i].click();
    return { picked: h[i].name };
  });
  await p.waitForTimeout(300);
  const chips = await p.evaluate(() => [...document.querySelectorAll('#skillBar .skill-chip')].map(c => c.textContent));
  console.log('状态:', await p.evaluate(() => ({
    skills: G.players[0].skills,
    isRed: (c) => c.suit,
    hand: G.players[0].hand.map(c => c.id + '/' + c.suit),
    views: (viewsOf(G.players[0], G.players[0].hand.find(c => (c.suit === 'd' || c.suit === 'h') && c.id !== 'sha')) || []).map(v => v.label),
    reqKind: UI.req && UI.req.kind,
    selCards: UI.sel.cards.length,
  })));
  console.log('选中:', res.picked, '→ 技能按钮:', chips);
  await p.screenshot({ path: 'tools/shot-transform.png' });
  console.log('ERRORS:', errors.length ? errors : 'none');
  await b.close();
})();
