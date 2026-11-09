const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h] of [[1280, 800], [844, 390], [768, 1024]]) {
    for (const n of [4, 8]) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      await p.goto('http://127.0.0.1:8000/?fast=1', { waitUntil: 'networkidle' });
      await p.selectOption('#selCount', String(n));
      await p.click('#btnStart');
      await p.waitForSelector('.hero', { timeout: 4000 });
      await p.waitForTimeout(350);
      await p.click('.hero .h-name');
      await p.waitForSelector('.seat .gcard');
      await p.waitForTimeout(500);
      const r = await p.evaluate(() => {
        const bs = [...document.querySelectorAll('.seat .gcard')].map(e => e.getBoundingClientRect());
        const hits = [];
        for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i], c = bs[j];
          const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
          const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (ox > 0.5 && oy > 0.5) hits.push(`${i}-${j}:${Math.round(ox)}x${Math.round(oy)}`);
        }
        const over = bs.filter(x => x.left < -0.5 || x.right > innerWidth + 0.5 || x.top < 0 || x.bottom > innerHeight).length;
        const clipped = [...document.querySelectorAll('.seat .gc-name')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
        return { n: bs.length, hits, over, clipped, cardW: bs.length ? Math.round(bs[0].width) : 0 };
      });
      console.log(`${w}x${h} ${n}人: 卡宽${r.cardW} 数量${r.n} 重叠=${r.hits.length ? r.hits.join(',') : '无'} 出界=${r.over} 截断=${r.clipped.length ? r.clipped.join(',') : '无'}`);
      await p.close();
    }
  }
  await b.close();
})();
