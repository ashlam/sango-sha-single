const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.click('#btnStart'); await p.waitForTimeout(250);
  await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(200);
  await p.evaluate(() => { setInterval(() => { if (!UI.req || UI.req.kind === 'play') return; const pl=UI.player,r=UI.req,fn=UI.resolve; Promise.resolve(AI.decide(pl,r)).then(res=>{UI.req=null;UI.player=null;UI.resolve=null;document.getElementById('modal').classList.add('hidden');if(fn)fn(res);}); }, 80); });
  for (let i = 0; i < 200; i++) { if (await p.evaluate(() => UI.req && UI.req.kind === 'play')) break; await p.waitForTimeout(120); }
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'tools/shot-land.png' });
  console.log(JSON.stringify(await p.evaluate(() => {
    const r = el => { if(!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]; };
    return {
      stage: r(document.querySelector('#stage')),
      selfArea: r(document.querySelector('#selfArea')),
      hand: r(document.querySelector('#handArea')),
      seats: [...document.querySelectorAll('.seat .gcard')].map(g => { const b=g.getBoundingClientRect(); return [Math.round(b.x),Math.round(b.y),Math.round(b.width)]; }),
      vScroll: document.documentElement.scrollHeight > window.innerHeight,
      hScroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  })));
  await b.close();
})();
