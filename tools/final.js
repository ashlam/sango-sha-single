const { chromium } = require('playwright-core');

async function longPress(page, sel, idx) {
  const els = await page.$$(sel);
  if (!els[idx]) return false;
  const b = await els[idx].boundingBox();
  if (!b) return false;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(300);
  return true;
}

async function setup(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#btnStart'); await page.waitForTimeout(300);
  await page.click('.hero:nth-child(1) .h-name'); await page.waitForTimeout(250);
  await page.evaluate(() => {
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
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate(() => UI.req && UI.req.kind === 'play')) break;
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });

  // ===== 竖屏 =====
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => { errors.push('PAGEERROR: ' + e.message); console.log('!! PAGEERROR:', e.message, '\n', (e.stack||'').split('\n').slice(0,5).join('\n')); });
  p.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('!! CONSOLE:', m.text()); } });

  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.click('#btnRule'); await p.waitForTimeout(350);
  await p.screenshot({ path: 'tools/f-guide.png' });
  console.log('指南弹窗:', await p.evaluate(() => !document.getElementById('modal').classList.contains('hidden')));
  console.log('指南步骤数:', await p.evaluate(() => document.querySelectorAll('.guide-step').length));
  await p.click('#mGuideOk'); await p.waitForTimeout(200);

  // 选将界面技能可点
  await p.click('#btnStart'); await p.waitForTimeout(350);
  const sk = await p.$('.hero .h-skill');
  if (sk) {
    await sk.click(); await p.waitForTimeout(350);
    console.log('选将技能弹层:', await p.evaluate(() => (document.querySelector('.sheet-title')||{}).textContent));
    await p.screenshot({ path: 'tools/f-heroskill.png' });
    await p.click('#sheetClose'); await p.waitForTimeout(250);
  }
  await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(300);
  await p.evaluate(() => {
    setInterval(() => {
      if (!UI.req || UI.req.kind === 'play') return;
      const pl = UI.player, r = UI.req, fn = UI.resolve;
      Promise.resolve(AI.decide(pl, r)).then(res => { UI.req=null; UI.player=null; UI.resolve=null; document.getElementById('modal').classList.add('hidden'); if(fn)fn(res); });
    }, 80);
  });
  for (let i = 0; i < 200; i++) { if (await p.evaluate(() => UI.req && UI.req.kind === 'play')) break; await p.waitForTimeout(120); }
  await p.waitForTimeout(300);

  console.log('状态:', JSON.stringify(await p.evaluate(() => ({
    game: !document.getElementById('gameScreen').classList.contains('hidden'),
    hand: G.players[0] ? G.players[0].hand.length : -1,
    domCards: document.querySelectorAll('#handArea .card').length,
    modal: !document.getElementById('modal').classList.contains('hidden'),
    over: G.over,
  }))));
  console.log('=== 点按仍能选牌（不被长按吞掉）===');
  const before = await p.evaluate(() => UI.sel.cards.length);
  await p.evaluate(() => document.querySelector('#handArea .card').click());
  await p.waitForTimeout(250);
  console.log('选中数:', before, '→', await p.evaluate(() => UI.sel.cards.length));

  console.log('=== 引导气泡 ===');
  console.log('coach 可见:', await p.evaluate(() => !document.getElementById('coach').classList.contains('hidden')));

  console.log('=== 长按后仍能正常操作 ===');
  await longPress(p, '#handArea .card', 0);
  await p.click('#sheetClose'); await p.waitForTimeout(300);
  await p.evaluate(() => { UI.sel.cards = []; UI.render(); });
  await p.evaluate(() => document.querySelector('#handArea .card').click());
  await p.waitForTimeout(250);
  console.log('长按后选中数:', await p.evaluate(() => UI.sel.cards.length));

  console.log('ERRORS(竖屏):', errors.length ? errors.slice(0,5) : 'none');
  await p.close();

  // ===== 横屏 =====
  const p2 = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const e2 = [];
  p2.on('pageerror', e => e2.push('PAGEERROR: ' + e.message));
  await setup(p2, 'http://localhost:8000/?fast=1');
  await longPress(p2, '#handArea .card', 0);
  console.log('横屏抽屉打开:', await p2.evaluate(() => !document.getElementById('sheet').classList.contains('hidden')));
  await p2.screenshot({ path: 'tools/f-land-sheet.png' });
  console.log('横屏抽屉高度:', await p2.evaluate(() => { const b = document.getElementById('sheetPanel').getBoundingClientRect(); return Math.round(b.height) + '/' + window.innerHeight; }));
  await p2.click('#sheetClose'); await p2.waitForTimeout(250);
  await p2.click('#btnCodex'); await p2.waitForTimeout(400);
  await p2.screenshot({ path: 'tools/f-land-codex.png' });
  console.log('ERRORS(横屏):', e2.length ? e2.slice(0,5) : 'none');
  await p2.close();

  await b.close();
})();
