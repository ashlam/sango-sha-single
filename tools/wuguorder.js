/* 浏览器端验证：五谷丰登从使用者开始依次选牌 */
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

  const out = await p.evaluate(async () => {
    G.over = true;
    G.beat = async () => {};
    const order = [];
    const orig = G.responder;
    G.responder = (pl, req) => {
      if (req.kind === 'pickOne') { order.push(pl.name); return { card: (req.cards || [])[0] }; }
      return orig ? orig(pl, req) : null;
    };
    const user = G.players[2];              // 丙座位发起
    G.current = 2;
    G.players.forEach(x => { x.isAI = false; });   // 让每个角色都走 ask，便于记录顺序
    const card = makeCard({ id: 'wugu', suit: 'h', num: 1 });
    user.hand.push(card);
    G.deck = [
      makeCard({ id: 'tao', suit: 'h', num: 3 }), makeCard({ id: 'sha', suit: 's', num: 7 }),
      makeCard({ id: 'shan', suit: 'd', num: 2 }), makeCard({ id: 'jiu', suit: 'c', num: 9 }),
    ];                                       // pop() 取末尾，这里是牌堆顶
    UI.render();
    const okUse = await useCard(user, card, [], { asId: 'wugu' });
    return { okUse, order, seats: G.players.map(x => x.seat + ':' + x.name) };
  });

  const expect = out.seats.slice(2).concat(out.seats.slice(0, 2)).map(s => s.split(':')[1]);
  OK(out.okUse === true, '五谷丰登可以使用');
  OK(JSON.stringify(out.order) === JSON.stringify(expect),
    `选牌顺序从使用者开始：${out.order.join(' → ')}（期望 ${expect.join(' → ')}）`);
  const logTxt = await p.evaluate(() => G.log.slice(-8).map(l => l.text).join('\n'));
  console.log(logTxt);
  console.log(errs.length ? 'ERR ' + errs.join(' | ') : '  无报错');
  await b.close();
})();
