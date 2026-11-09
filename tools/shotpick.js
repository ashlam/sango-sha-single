const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h, tag] of [[390, 844, 'phone'], [1280, 800, 'desk']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
    await p.click('#btnStart');
    await p.waitForSelector('.hero .h-name');
    await p.waitForTimeout(300);
    const info = await p.evaluate(() => [...document.querySelectorAll('.hero')].map(h => {
      const n = h.querySelector('.h-name').getBoundingClientRect();
      const sk = h.querySelector('.h-skills').getBoundingClientRect();
      return {
        name: h.querySelector('.h-name').textContent,
        overlap: Math.round(Math.max(0, n.bottom - sk.top)),
        nameBottom: Math.round(n.bottom), skillsTop: Math.round(sk.top),
      };
    }));
    console.log(tag, JSON.stringify(info));
    await p.screenshot({ path: `tools/shot-pick-${tag}.png` });
    await p.close();
  }
  await b.close();
})();
