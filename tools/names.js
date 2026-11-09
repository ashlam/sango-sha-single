const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const n of [4, 5, 6]) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
    await p.selectOption('#selCount', String(n));
    await p.click('#btnStart'); await p.waitForTimeout(300);
    await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('.seat .gcard').forEach(g => {
        const nm = g.querySelector('.gc-name');
        const hp = g.querySelector('.gc-hp');
        out.push({
          name: nm.textContent,
          truncated: nm.scrollWidth > nm.clientWidth + 1,
          hpDots: hp.querySelectorAll('.dot').length,
          tag: (hp.querySelector('.id-tag') || {}).textContent || '',
        });
      });
      const me = G.players[0];
      return { seats: out, meHp: me.hp + '/' + me.maxHp, lord: G.players.find(x=>x.identity==='lord').general + ' ' + G.players.find(x=>x.identity==='lord').hp + '/' + G.players.find(x=>x.identity==='lord').maxHp };
    });
    const trunc = r.seats.filter(x => x.truncated).map(x => x.name);
    console.log(`${n}人局 截断名字: ${trunc.length ? trunc.join(',') : '无'}  | 主公 ${r.lord} | 我 ${r.meHp}`);
    await p.close();
  }
  await b.close();
})();
