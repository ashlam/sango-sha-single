const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const n of [4, 5, 6, 8]) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto('http://127.0.0.1:8000/?fast=1', { waitUntil: 'networkidle' });
    await p.selectOption('#selCount', String(n));
    await p.click('#btnStart');
    await p.waitForSelector('.hero', { timeout: 4000 });
    await p.waitForTimeout(350);
    await p.click('.hero .h-name');
    await p.waitForSelector('.seat .gcard');
    await p.waitForTimeout(400);
    // 强制显示引导条，检查是否压住座位卡
    const r = await p.evaluate(() => {
      COACH.reset();
      COACH.show('play', '出牌阶段：点按手牌选择要用的牌 → 点按目标 → 点【使用】');
      const c = document.querySelector('#coach .coach-in').getBoundingClientRect();
      const bs = [...document.querySelectorAll('.seat .gcard')].map(e => e.getBoundingClientRect());
      const hits = bs.map((a, i) => {
        const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        return ox > 0 && oy > 0 ? `${i}:${Math.round(ox)}x${Math.round(oy)}` : null;
      }).filter(Boolean);
      return { hits, coachBottom: Math.round(c.bottom), topCard: Math.round(Math.min(...bs.map(x => x.top))) };
    });
    console.log(`${n}人: 引导条遮卡=${r.hits.length ? r.hits.join(',') : '无'} (引导底${r.coachBottom} / 卡顶${r.topCard})`);
    await p.close();
  }
  await b.close();
})();
