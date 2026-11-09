const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.click('#btnStart'); await p.waitForTimeout(250);
  await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(200);

  // 自动接管非出牌请求
  await p.evaluate(() => {
    setInterval(() => {
      if (!UI.req || UI.req.kind === 'play') return;
      const pl = UI.player, r = UI.req, fn = UI.resolve;
      Promise.resolve(AI.decide(pl, r)).then(res => {
        UI.req = null; UI.player = null; UI.resolve = null;
        document.getElementById('modal').classList.add('hidden');
        if (fn) fn(res);
      });
    }, 80);
  });

  let plays = 0, targets = 0, rejects = 0;
  for (let round = 0; round < 40; round++) {
    // 等待玩家出牌阶段
    let ok = false;
    for (let i = 0; i < 250; i++) {
      const st = await p.evaluate(() => UI.req && UI.req.kind);
      if (st === 'play') { ok = true; break; }
      if (await p.evaluate(() => G.over)) break;
      await p.waitForTimeout(100);
    }
    if (!ok) break;

    // 尝试用第一张可用牌
    const idx = await p.evaluate(() => {
      const h = G.players[0].hand;
      for (let i = 0; i < h.length; i++) {
        const el = document.querySelectorAll('#handArea .card')[i];
        if (el && !el.classList.contains('dimmed') && !el.classList.contains('disabled')) return i;
      }
      return -1;
    });
    if (idx < 0) {
      await p.click('#btnCancel').catch(() => {});
      await p.waitForTimeout(200);
      continue;
    }
    await p.evaluate(i => document.querySelectorAll('#handArea .card')[i].click(), idx);
    await p.waitForTimeout(150);

    // 选目标
    const sel = await p.$('.seat.selectable');
    if (sel) {
      await sel.click(); await p.waitForTimeout(150);
      targets++;
      const can = await p.evaluate(() => !document.getElementById('btnConfirm').disabled);
      if (can) { await p.click('#btnConfirm'); plays++; await p.waitForTimeout(400); }
      else { await p.click('#btnCancel').catch(() => {}); rejects++; await p.waitForTimeout(150); }
    } else {
      // 无目标（如无懈可击）：直接确认
      const can = await p.evaluate(() => !document.getElementById('btnConfirm').disabled);
      if (can) { await p.click('#btnConfirm'); plays++; await p.waitForTimeout(400); }
      else { await p.click('#btnCancel').catch(() => {}); rejects++; await p.waitForTimeout(150); }
    }
  }

  const st = await p.evaluate(() => ({
    over: G.over, turn: G.turn,
    hand: G.players[0].hand.length,
    hp: G.players[0].hp,
    discards: G.discard.length,
    log: G.log.length,
  }));
  console.log('成功出牌:', plays, '选目标:', targets, '取消/拒绝:', rejects);
  console.log('最终状态:', JSON.stringify(st));
  console.log('ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
  await b.close();
})();
