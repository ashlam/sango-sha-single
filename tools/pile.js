const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.click('#btnStart'); await p.waitForTimeout(300);
  await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(400);
  // 造几张弃牌
  await p.evaluate(() => { toDiscard(G.players[0].hand.slice(0,3)); UI.render(); });
  await p.waitForTimeout(200);
  await p.click('#pileDiscard'); await p.waitForTimeout(400);
  console.log('抽屉标题:', await p.evaluate(() => (document.querySelector('.sheet-title')||{}).textContent));
  console.log('弃牌条目数:', await p.evaluate(() => document.querySelectorAll('#sheetBody .pile-row').length));
  await p.screenshot({ path: 'tools/ui-pile.png' });
  await p.click('#sheetClose'); await p.waitForTimeout(250);
  await p.click('#pileDraw'); await p.waitForTimeout(400);
  console.log('牌堆抽屉标题:', await p.evaluate(() => (document.querySelector('.sheet-title')||{}).textContent));
  await b.close();
})();
