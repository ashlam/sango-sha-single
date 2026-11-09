const { chromium } = require('playwright-core');
const AUTO = `setInterval(() => {
  if (!UI.req || UI.req.kind === 'play') return;
  const pl = UI.player, r = UI.req, fn = UI.resolve;
  Promise.resolve(AI.decide(pl, r)).then(res => {
    UI.req = null; UI.player = null; UI.resolve = null;
    document.getElementById('modal').classList.add('hidden');
    if (fn) fn(res);
  });
}, 60);`;
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h, tag] of [[390, 844, 'phone'], [844, 390, 'land']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8000/?fast=1&players=8', { waitUntil: 'networkidle' });
    await p.click('#btnStart');
    await p.waitForSelector('.hero');
    await p.waitForTimeout(300);
    await p.click('.hero .h-name');
    await p.waitForSelector('.seat .gcard');
    await p.evaluate(AUTO);
    for (let i = 0; i < 200; i++) {
      const ready = await p.evaluate(() => UI.req && UI.req.kind === 'play' && document.getElementById('modal').classList.contains('hidden'));
      if (ready) break;
      await p.waitForTimeout(120);
    }
    await p.waitForTimeout(400);
    await p.screenshot({ path: `tools/shot8-${tag}.png` });
    console.log(tag, 'errors:', errs.slice(0, 3), 'turn:', await p.evaluate(() => G.turn + '/' + G.players[G.current].general));
    await p.close();
  }
  await b.close();
})();
