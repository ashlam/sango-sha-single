const { chromium } = require('playwright-core');

async function clearModals(page, times = 12) {
  for (let i = 0; i < times; i++) {
    const open = await page.evaluate(() => !document.getElementById('modal').classList.contains('hidden'));
    if (!open) return;
    const btn = await page.$('#mNo') || await page.$('#mArrOk') || await page.$('#mRuleOk');
    if (btn) await btn.click(); else break;
    await page.waitForTimeout(300);
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8000/', { waitUntil: 'networkidle' });
  await page.click('#btnStart');
  await page.waitForTimeout(300);
  await page.click('.hero:nth-child(1) .h-name');
  await page.waitForTimeout(600);
  await clearModals(page);

  // 等到出牌阶段
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => ({ kind: UI.req && UI.req.kind, phase: G.phase, turn: G.turn, over: G.over }));
    if (st.kind === 'play' || st.over) break;
    await clearModals(page, 2);
    await page.waitForTimeout(350);
    await clearModals(page, 2);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tools/shot-game.png' });

  console.log('=== 布局 ===');
  console.log(JSON.stringify(await page.evaluate(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    return {
      stage: r(document.querySelector('#stage')),
      self: r(document.querySelector('#selfArea')),
      hand: r(document.querySelector('#handArea')),
      seats: [...document.querySelectorAll('.seat')].map(s => [s.dataset.seat, ...r(s)]),
      cards: [...document.querySelectorAll('#handArea .card')].map(c => r(c)),
      skillBar: r(document.querySelector('#skillBar')),
      actionBar: r(document.querySelector('#actionBar')),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  }), null, 0));

  console.log('=== 状态 ===');
  console.log(JSON.stringify(await page.evaluate(() => ({
    phase: G.phase, turn: G.turn, cur: G.current,
    players: G.players.map(p => `${p.seat}:${p.general}(${p.hp}/${p.maxHp}) hand=${p.hand.length} ${p.identity}`),
    req: UI.req ? UI.req.kind : null,
    prompt: UI.req ? (UI.req.prompt || '') : '',
  }))));

  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})();
