/* 浏览器回归：方天画戟用最后一张手牌【杀】时应能选 3 个目标 */
const { chromium } = require('playwright-core');
const OK = (c, m) => console.log((c ? '  ok   ' : '  FAIL ') + m);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://127.0.0.1:8000/?fast=1&players=4&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 5000 });
  await p.click('.hero .h-name');
  await p.waitForSelector('.seat .gcard', { timeout: 5000 });
  await p.waitForTimeout(400);

  const setup = await p.evaluate(() => {
    G.over = true;
    G.beat = async () => {};
    const me = G.players[0];
    me.equip.weapon = makeCard({ id: 'fangtian', suit: 'd', num: 12 });
    const sha = makeCard({ id: 'sha', suit: 's', num: 7 });
    me.hand = [sha];
    G.current = 0;
    UI.req = { kind: 'play', cancelable: true };
    UI.sel = { cards: [sha], targets: [], asId: null };
    UI.render();
    return { max: targetCountRange(me, 'sha', sha).max, seats: G.players.map(x => x.seat) };
  });
  OK(setup.max === 3, `最后一张手牌【杀】的目标上限为 3（实际 ${setup.max}）`);

  await p.waitForTimeout(200);
  const txt = await p.evaluate(() => document.getElementById('actionPrompt').textContent);
  OK(/1–3 个目标/.test(txt) && /方天画戟/.test(txt), `提示写明可选范围（${txt}）`);

  /* 连点三个目标 → 全选上 */
  await p.evaluate(() => { onSeatClick(1); onSeatClick(2); onSeatClick(3); });
  let st = await p.evaluate(() => UI.sel.targets.map(t => t.seat));
  OK(st.length === 3, `可以选中 3 个目标（${st.join(',')}）`);

  /* 再点第四个（已无第四个敌人，改点已选的 1 号取消再选回） */
  await p.evaluate(() => { onSeatClick(1); });              // 取消
  const afterCancel = await p.evaluate(() => UI.sel.targets.map(t => t.seat));
  OK(afterCancel.length === 2, `再点一次可取消选择（${afterCancel.join(',')}）`);

  console.log(errs.length ? 'ERR ' + errs.join(' | ') : '  无报错');
  await b.close();
})();
