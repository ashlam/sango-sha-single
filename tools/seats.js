const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const n of [4, 5, 6]) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
    await p.selectOption('#selCount', String(n));
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
    await p.waitForTimeout(300);
    await p.screenshot({ path: `tools/shot-${n}p.png` });
    const boxes = await p.evaluate(() => [...document.querySelectorAll('.seat')].map(s => { const r = s.getBoundingClientRect(); return { seat: s.dataset.seat, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; }));
    // 检查重叠
    let ov = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i+1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + 70 && c.y < a.y + 70) ov++;
    }
    console.log(n + '人局 座位重叠数:', ov, JSON.stringify(boxes));
    await p.close();
  }
  await b.close();
})();
