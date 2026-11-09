const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.click('#btnStart'); await p.waitForTimeout(250);
  await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(200);
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
  for (let i = 0; i < 200; i++) {
    if (await p.evaluate(() => UI.req && UI.req.kind === 'play')) break;
    await p.waitForTimeout(120);
  }
  console.log(JSON.stringify(await p.evaluate(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom) }; };
    return {
      stage: r(document.querySelector('#stage')),
      selfArea: r(document.querySelector('#selfArea')),
      selfRow: r(document.querySelector('#selfRow')),
      selfGeneral: r(document.querySelector('#selfGeneral')),
      handArea: r(document.querySelector('#handArea')),
      handCards: [...document.querySelectorAll('#handArea .card')].map(c => r(c)),
      seats: [...document.querySelectorAll('.seat')].map(s => ({ seat: s.dataset.seat, ...r(s) })),
      actionBar: r(document.querySelector('#actionBar')),
      skillBar: r(document.querySelector('#skillBar')),
      cardW: getComputedStyle(document.documentElement).getPropertyValue('--cw'),
      cardH: getComputedStyle(document.documentElement).getPropertyValue('--ch'),
      handCount: G.players[0].hand.length,
    };
  }), null, 1));
  await b.close();
})();
