const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const n of [4, 5, 6, 8]) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
    await p.selectOption('#selCount', String(n));
    await p.click('#btnStart'); await p.waitForSelector('.hero', { timeout: 4000 }); await p.waitForTimeout(350);
    await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(200);
    await p.evaluate(() => { setInterval(() => { if (!UI.req || UI.req.kind === 'play') return; const pl=UI.player,r=UI.req,fn=UI.resolve; Promise.resolve(AI.decide(pl,r)).then(res=>{UI.req=null;UI.player=null;UI.resolve=null;document.getElementById('modal').classList.add('hidden');if(fn)fn(res);}); }, 80); });
    for (let i = 0; i < 200; i++) { if (await p.evaluate(() => UI.req && UI.req.kind === 'play')) break; await p.waitForTimeout(120); }
    // 用真实包围盒求交集
    const res = await p.evaluate(() => {
      const bs = [...document.querySelectorAll('.seat .gcard')].map(el => el.getBoundingClientRect());
      const hits = [];
      for (let i = 0; i < bs.length; i++) for (let j = i+1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (ox > 0 && oy > 0) hits.push(`${i}-${j}: ${Math.round(ox)}x${Math.round(oy)}`);
      }
      const overflow = bs.filter(r => r.left < 0 || r.right > 390).length;
      return { hits, overflow, count: bs.length };
    });
    console.log(`${n}人局: 卡片${res.count} 真正重叠=${res.hits.length ? res.hits.join(',') : '无'} 出血=${res.overflow}`);
    await p.close();
  }
  await b.close();
})();
