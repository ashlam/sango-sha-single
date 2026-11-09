const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8000/?players=8', { waitUntil: 'networkidle' });
  await p.selectOption('#selCount', '8');
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 5000 });
  await p.waitForTimeout(300);
  await p.click('.hero .h-name');
  await p.waitForSelector('.seat .gcard');
  // 处理非出牌请求，让 AI 动起来
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
    // 玩家也自动出牌，制造大量横幅
    setInterval(() => {
      if (!UI.req || UI.req.kind !== 'play') return;
      const pl = UI.player, r = UI.req, fn = UI.resolve;
      Promise.resolve(AI.decide(pl, r)).then(res => {
        UI.req = null; UI.player = null; UI.resolve = null;
        if (fn) fn(res);
      });
    }, 700);
  });

  const checked = [];
  let shot = false;
  for (let i = 0; i < 500 && checked.length < 5; i++) {
    const r = await p.evaluate(() => {
      const row = document.querySelector('#banner .bn-row');
      if (!row || document.getElementById('banner').classList.contains('hidden')) return null;
      const card = row.querySelector('.bn-card');
      if (!card || !row.querySelector('.bn-targets')) return null;
      const c = card.getBoundingClientRect();
      const items = [...row.querySelectorAll('.bn-who,.bn-verb,.bn-targets,.bn-to')];
      const hits = items.map(e => {
        const t = e.getBoundingClientRect();
        const ox = Math.min(t.right, c.right) - Math.max(t.left, c.left);
        const oy = Math.min(t.bottom, c.bottom) - Math.max(t.top, c.top);
        return ox > 0.5 && oy > 0.5 ? `${e.className.split(' ')[0]}(${Math.round(ox)}x${Math.round(oy)})` : null;
      }).filter(Boolean);
      // 牌是否溢出容器
      const inner = card.querySelector('.card').getBoundingClientRect();
      const overflow = inner.left < c.left - 0.5 || inner.right > c.right + 0.5 ? `溢出${Math.round(inner.width - c.width)}px` : '';
      return { hits, overflow, text: row.textContent.trim().slice(0, 30) };
    });
    if (r) {
      checked.push(r);
      if (!shot && r.hits.length === 0) { await p.screenshot({ path: 'tools/shot-banner.png' }); shot = true; }
    }
    await p.waitForTimeout(120);
  }
  console.log(JSON.stringify(checked, null, 1));
  console.log('errs', errs.slice(0, 3));
  await b.close();
})();
