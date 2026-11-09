/* 检查：主公座位随机后，仍然是主公先手，且界面高亮正确 */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const rows = [];
  for (let i = 0; i < 6; i++) {
    await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now() + i, { waitUntil: 'networkidle' });
    await p.click('#btnStart');
    await p.waitForSelector('.hero .h-name');
    await p.click('.hero .h-name');
    await p.waitForSelector('.seat .gcard');
    await p.waitForTimeout(250);
    rows.push(await p.evaluate(() => {
      const lord = G.players.find(x => x.identity === 'lord');
      const first = (G.log.find(l => /第 1 回合/.test(l.text)) || {}).text || '(未记录)';
      return {
        me: IDENTITY_CN[G.players[0].identity],
        lordSeat: lord.seat, lordName: lord.general,
        firstLog: first,
        lordFirst: first.includes(lord.general),
      };
    }));
    if (i === 0) await p.screenshot({ path: 'tools/shot-lordseat.png' });
  }
  rows.forEach((r, i) => console.log(`局${i}: 玩家=${r.me} 主公=${r.lordName}(座位${r.lordSeat}) 主公先手=${r.lordFirst} | ${r.firstLog}`));
  console.log('errs', errs.slice(0, 3));
  await b.close();
})();
