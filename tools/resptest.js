/* 响应场景回归：龙胆当杀响应南蛮 / 濒死自救牌过滤 */
const { chromium } = require('playwright-core');
const OK = (c, m) => console.log((c ? '  ok   ' : '  FAIL ') + m);

async function boot(b) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 5000 });
  await p.click('.hero .h-name');
  await p.waitForSelector('.seat .gcard', { timeout: 5000 });
  // 冻结引擎主循环（用 G.over 让它自然退出），但保留 responder → UI.prompt 通路
  await p.evaluate(() => {
    G.over = true;
    G.beat = async () => {};
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => { G.over = false; G.current = 0; UI.req = null; });
  return { p, errs };
}

/* 手牌里指定 id 的牌是否被置灰 */
const disabled = (p, id) => p.evaluate((id) => {
  const me = G.players[0];
  const c = me.hand.find(x => x.id === id);
  const el = c && document.querySelector(`#handArea .card[data-uid="${c.uid}"]`);
  return el ? el.classList.contains('disabled') : null;
}, id);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });

  /* 1. 赵云（龙胆）用【闪】响应【南蛮入侵】 */
  {
    const { p, errs } = await boot(b);
    await p.evaluate(() => {
      const me = G.players[0];
      me.skills = ['longdan'];
      me.hand = [makeCard({ id: 'shan', suit: 'h', num: 2 })];
      UI.render();
      window.__done = false;
      resolveCard(G.players[1], makeVirtual('nanman'), 'nanman', [me]).then(() => { window.__done = true; });
    });
    await p.waitForTimeout(400);
    const txt = await p.evaluate(() => document.getElementById('actionPrompt').textContent);
    OK(/杀/.test(txt), `出现响应请求：${txt}`);
    const dim = await disabled(p, 'shan');
    OK(dim === false, `龙胆：【闪】可以点（disabled=${dim}）`);
    await p.click('#handArea .card');
    await p.waitForTimeout(120);
    const hint = await p.evaluate(() => document.getElementById('actionPrompt').textContent);
    OK(/当【杀】打出/.test(hint), `选中后提示转化：${hint}`);
    await p.click('#btnConfirm');
    await p.waitForFunction(() => window.__done, { timeout: 5000 }).catch(() => {});
    const r = await p.evaluate(() => ({
      hp: G.players[0].hp, max: G.players[0].maxHp, hand: G.players[0].hand.length, done: window.__done,
    }));
    OK(r.done && r.hp === r.max && r.hand === 0, `用【闪】当【杀】响应后不受伤 (hp=${r.hp}/${r.max}, 手牌=${r.hand})`);
    console.log(errs.length ? 'ERR ' + errs[0] : '  无报错');
    await p.close();
  }

  /* 2. 没有龙胆时【闪】不可选 */
  {
    const { p, errs } = await boot(b);
    await p.evaluate(() => {
      const me = G.players[0];
      me.skills = [];
      me.hand = [makeCard({ id: 'shan', suit: 'h', num: 2 }), makeCard({ id: 'sha', suit: 's', num: 5 })];
      UI.render();
      window.__done = false;
      resolveCard(G.players[1], makeVirtual('nanman'), 'nanman', [me]).then(() => { window.__done = true; });
    });
    await p.waitForTimeout(400);
    const dimShan = await disabled(p, 'shan');
    const dimSha = await disabled(p, 'sha');
    OK(dimShan === true, `普通武将：【闪】置灰 (disabled=${dimShan})`);
    OK(dimSha === false, `普通武将：【杀】可点 (disabled=${dimSha})`);
    await p.click('#btnCancel').catch(() => {});
    await p.waitForTimeout(300);
    console.log(errs.length ? 'ERR ' + errs[0] : '  无报错');
    await p.close();
  }

  /* 3. 濒死：只有【桃】可选，且选完不再问一次 */
  {
    const { p, errs } = await boot(b);
    await p.evaluate(() => {
      const me = G.players[0];
      me.skills = [];
      me.hp = 1;
      me.hand = [makeCard({ id: 'tao', suit: 'h', num: 3 }), makeCard({ id: 'shan', suit: 's', num: 4 })];
      UI.render();
      damage(G.players[1], me, 1, null, null);
    });
    await p.waitForTimeout(400);
    const st = await p.evaluate(() => ({
      kind: UI.req && UI.req.kind,
      txt: document.getElementById('actionPrompt').textContent,
    }));
    OK(st.kind === 'save', `濒死请求 (${st.kind}: ${st.txt})`);
    const dimTao = await disabled(p, 'tao');
    const dimShan = await disabled(p, 'shan');
    OK(dimTao === false && dimShan === true, `只有【桃】可点 (桃=${dimTao}, 闪=${dimShan})`);
    await p.click('#handArea .card[data-uid]');
    await p.click('#btnConfirm');
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => ({
      hp: G.players[0].hp, alive: G.players[0].alive,
      kind: UI.req && UI.req.kind, bar: !document.getElementById('actionBar').classList.contains('hidden'),
    }));
    OK(r.alive && r.hp === 1, `用【桃】救回自己 (hp=${r.hp})`);
    OK(!r.bar, `没有再弹第二遍选牌 (req=${r.kind})`);
    console.log(errs.length ? 'ERR ' + errs[0] : '  无报错');
    await p.close();
  }

  /* 4. 自己的回合用【酒】自救 */
  {
    const { p, errs } = await boot(b);
    await p.evaluate(() => {
      const me = G.players[0];
      G.current = 0;
      me.skills = [];
      me.hp = 1;
      me.hand = [makeCard({ id: 'jiu', suit: 's', num: 9 })];
      UI.render();
      damage(G.players[1], me, 1, null, null);
    });
    await p.waitForTimeout(400);
    const dimJiu = await disabled(p, 'jiu');
    OK(dimJiu === false, `濒死时【酒】可选 (disabled=${dimJiu})`);
    await p.click('#handArea .card');
    await p.click('#btnConfirm');
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({ hp: G.players[0].hp, alive: G.players[0].alive }));
    OK(r.alive && r.hp === 1, `用【酒】自救 (hp=${r.hp})`);
    console.log(errs.length ? 'ERR ' + errs[0] : '  无报错');
    await p.close();
  }

  /* 4b. 别人回合濒死，手上只有【酒】——酒也能自救 */
  {
    const { p, errs } = await boot(b);
    await p.evaluate(() => {
      const me = G.players[0];
      G.current = 1;                       // 伤害来自别人的回合
      me.skills = [];
      me.hp = 1;
      me.hand = [makeCard({ id: 'jiu', suit: 'd', num: 9 })];
      UI.render();
      damage(G.players[1], me, 1, null, null);
    });
    await p.waitForTimeout(400);
    const st = await p.evaluate(() => ({
      kind: UI.req && UI.req.kind,
      txt: document.getElementById('actionPrompt').textContent,
    }));
    OK(st.kind === 'save', `回合外濒死请求 (${st.txt})`);
    const dimJiu = await disabled(p, 'jiu');
    OK(dimJiu === false, `回合外濒死【酒】可点 (disabled=${dimJiu})`);
    await p.click('#handArea .card');
    await p.click('#btnConfirm');
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({ hp: G.players[0].hp, alive: G.players[0].alive }));
    OK(r.alive && r.hp === 1, `回合外【酒】自救 (hp=${r.hp})`);
    console.log(errs.length ? 'ERR ' + errs[0] : '  无报错');
    await p.close();
  }

  await b.close();
})();
