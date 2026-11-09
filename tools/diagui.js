const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (let run = 0; run < 2; run++) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8000/?auto=1&fast=1&players=8', { waitUntil: 'networkidle' });
    // hook useCard 失败 + ask 次数
    await p.evaluate(() => {
      window.__stat = { fail: 0, failDetail: [], asks: {}, renders: 0 };
      const orig = window.useCard;
      window.useCard = async function (...a) {
        const r = await orig.apply(this, a);
        if (!r) {
          __stat.fail++;
          const [u, c, t] = a;
          if (__stat.failDetail.length < 25) __stat.failDetail.push(`${G.turn}|${u.general}|${c && c.name}|sha=${u.shaCount}|legal=${validTargets(u, (c && c.id), c).length}|req=${JSON.stringify((t || []).map(x => x.general))}`);
        }
        return r;
      };
      const origAsk = window.ask;
      window.ask = async function (p2, req) {
        __stat.asks[req.kind] = (__stat.asks[req.kind] || 0) + 1;
        return origAsk.call(this, p2, req);
      };
    });
    for (let i = 0; i < 700; i++) {
      if (await p.evaluate(() => G.over)) break;
      await p.waitForTimeout(90);
    }
    const st = await p.evaluate(() => {
      const logs = G.log;
      // 找同一回合同一角色的「使用」重复
      const byTurn = {};
      logs.forEach(l => {
        const m = /^(.+?) 使用 (.+?)(（视为【(.+?)】）)?$/.exec(l.text);
        if (m) { byTurn[G.turn] = byTurn[G.turn] || []; }
      });
      return { over: G.over, turn: G.turn, fail: __stat.fail, detail: __stat.failDetail.slice(0, 8), asks: __stat.asks,
        useCount: logs.filter(l => /使用|打出/.test(l.text)).length,
        tail: logs.slice(-6).map(l => l.text) };
    });
    console.log('run' + run, JSON.stringify(st, null, 1), 'errs', errs.slice(0, 2));
    await p.close();
  }
  await b.close();
})();
