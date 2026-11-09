const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const w of [320, 360, 390, 430]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    await p.goto('http://127.0.0.1:8000/?fast=1', { waitUntil: 'networkidle' });
    await p.selectOption('#selCount', '8');
    await p.click('#btnStart');
    await p.waitForSelector('.hero', { timeout: 4000 });
    await p.waitForTimeout(350);
    await p.click('.hero .h-name');
    await p.waitForSelector('.seat .gcard', { timeout: 6000 });
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => {
      const bs = [...document.querySelectorAll('.seat .gcard')].map(e => e.getBoundingClientRect());
      const hits = [];
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (ox > 0.5 && oy > 0.5) hits.push(`${i}-${j}:${Math.round(ox)}x${Math.round(oy)}`);
      }
      const over = bs.filter(r => r.left < -0.5 || r.right > innerWidth + 0.5).length;
      const names = [...document.querySelectorAll('.seat .gc-name')].map(e => e.scrollWidth > e.clientWidth + 1 ? e.textContent : null).filter(Boolean);
      return { hits, over, n: bs.length, clipped: names, cardW: Math.round(bs[0].width) };
    });
    console.log(`${w}px 8人: 卡宽${r.cardW} 数量${r.n} 重叠=${r.hits.length ? r.hits.join(',') : '无'} 出血=${r.over} 名字截断=${r.clipped.length ? r.clipped.join(',') : '无'}`);
    await p.close();
  }
  await b.close();
})();
