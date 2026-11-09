/* 浏览器回归：装备在 UI 层的触发（丈八蛇矛两张当杀 / 朱雀羽扇当火杀 / 装备栏显示） */
const { chromium } = require('playwright-core');
const OK = (c, m) => console.log((c ? '  ok   ' : '  FAIL ') + m);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://127.0.0.1:8000/?fast=1&players=4&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 5000 });
  await p.click('.hero .h-name');
  await p.waitForSelector('.seat .gcard', { timeout: 5000 });
  await p.waitForTimeout(400);

  /* ---------- 公共：冻结对局，摆一手牌 ---------- */
  const bench = async (weapon, ids) => await p.evaluate(({ weapon, ids }) => {
    G.over = true;
    G.beat = async () => {};
    const me = G.players[0];
    me.equip = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    me.hand = ids.map(id => makeCard({ id, suit: 'h', num: 6 }));
    me.isAI = false;
    if (weapon) me.equip.weapon = makeCard({ id: weapon, suit: 's', num: 1 });
    G.current = 0;
    G.phase = 'play';
    window.__got = null;
    UI.player = me;
    UI.resolve = r => { window.__got = r; };
    UI.req = { kind: 'play', options: [], cancelable: true, prompt: '出牌阶段' };
    UI.sel = { cards: [], targets: [], asId: null, zb: false };
    UI.render();
    return me.hand.map(c => c.uid);
  }, { weapon, ids });

  /* ---------- 1. 装备栏显示 ---------- */
  console.log('── 装备栏');
  const eqTxt = await p.evaluate(() => {
    const me = G.players[0];
    me.equip.weapon = makeCard({ id: 'qinglong', suit: 's', num: 2 });
    me.equip.armor = makeCard({ id: 'bagua', suit: 's', num: 2 });
    me.equip.horsePlus = makeCard({ id: 'dilu', suit: 's', num: 5 });
    me.equip.horseMinus = makeCard({ id: 'chitu', suit: 'h', num: 5 });
    UI.render();
    return document.getElementById('selfEquip').textContent;
  });
  OK(/青龙偃月刀/.test(eqTxt) && /八卦阵/.test(eqTxt) && /的卢/.test(eqTxt) && /赤兔/.test(eqTxt),
    `四个装备槽都显示牌名（${eqTxt.replace(/\s+/g, ' ').trim()}）`);

  /* ---------- 2. 丈八蛇矛：出牌阶段两张当【杀】 ---------- */
  console.log('── 丈八蛇矛 · 出牌');
  await bench('zhangba', ['nanman', 'tao', 'shan']);
  const beforeSel = await p.evaluate(() => {
    onCardClick(G.players[0].hand[0]);
    return {
      chips: [...document.querySelectorAll('#skillBar .skill-chip')].map(b => b.textContent),
      sel: UI.sel.cards.length,
    };
  });
  OK(beforeSel.chips.some(t => /丈八蛇矛/.test(t)), `选中一张牌后出现丈八按钮（${beforeSel.chips.join(' / ')}）`);

  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('#skillBar .skill-chip')].find(b => /丈八蛇矛/.test(b.textContent));
    btn.click();
  });
  let zbState = await p.evaluate(() => ({ zb: UI.sel.zb, txt: document.getElementById('actionPrompt').textContent }));
  OK(zbState.zb === true, '点击后进入「凑两张」模式');
  OK(/再点一张手牌/.test(zbState.txt), `提示引导选第二张（${zbState.txt}）`);

  await p.evaluate(() => onCardClick(G.players[0].hand[1]));
  zbState = await p.evaluate(() => ({
    n: UI.sel.cards.length,
    txt: document.getElementById('actionPrompt').textContent,
    ok: !document.getElementById('btnConfirm').disabled,
  }));
  OK(zbState.n === 2, '两张手牌都进入选择');
  OK(/请选择 1 个目标/.test(zbState.txt), `提示转为选择目标（${zbState.txt}）`);

  await p.evaluate(() => onSeatClick(1));
  const used = await p.evaluate(() => {
    onConfirm();
    const r = window.__got || {};
    return {
      action: r.action,
      asId: r.asId,
      extra: (r.extraCards || []).length,
      targets: (r.targets || []).length,
      keep: G.players[0].hand.length,
    };
  });
  OK(used.action === 'use' && used.asId === 'sha', `提交为使用【杀】（action=${used.action}, asId=${used.asId}）`);
  OK(used.extra === 1, `带上第二张牌（extraCards=${used.extra}）`);
  OK(used.targets === 1, '带上 1 个目标');

  /* ---------- 3. 丈八蛇矛：响应时两张当【杀】 ---------- */
  console.log('── 丈八蛇矛 · 响应');
  await bench('zhangba', ['tao', 'wuzhong']);
  await p.evaluate(() => {
    UI.req = {
      kind: 'respond', asId: 'sha', cancelable: true, zhangba: true,
      prompt: '请打出一张【杀】',
      valid: c => canAsSha(G.players[0], c),
    };
    UI.resolve = r => { window.__got = r; };
    UI.sel = { cards: [], targets: [], asId: null, zb: false };
    UI.render();
    onCardClick(G.players[0].hand[0]);
    onCardClick(G.players[0].hand[1]);
  });
  const resp = await p.evaluate(() => {
    const txt = document.getElementById('actionPrompt').textContent;
    const ok = !document.getElementById('btnConfirm').disabled;
    onConfirm();
    const r = window.__got || {};
    return { txt, ok, n: (r.cards || []).length, card: !!r.card };
  });
  OK(resp.ok, '选满两张后「确定」可点');
  OK(/丈八蛇矛/.test(resp.txt) && /当【杀】打出/.test(resp.txt), `提示写明两张当【杀】（${resp.txt}）`);
  OK(resp.n === 2 && !resp.card, `提交 {cards:[2]}（${resp.n} 张）`);

  /* ---------- 4. 丈八：没装备时不给凑牌入口 ---------- */
  console.log('── 丈八蛇矛 · 反例');
  await bench('qinggang', ['tao', 'wuzhong']);
  const noZb = await p.evaluate(() => {
    onCardClick(G.players[0].hand[0]);
    return [...document.querySelectorAll('#skillBar .skill-chip')].map(b => b.textContent);
  });
  OK(!noZb.some(t => /丈八蛇矛/.test(t)), '没装丈八时没有凑牌按钮');

  /* ---------- 5. 朱雀羽扇：普通【杀】当火【杀】 ---------- */
  console.log('── 朱雀羽扇 · 出牌');
  await bench('zhuque', ['sha']);
  const fire = await p.evaluate(() => {
    onCardClick(G.players[0].hand[0]);
    const chips = [...document.querySelectorAll('#skillBar .skill-chip')].map(b => b.textContent);
    const btn = [...document.querySelectorAll('#skillBar .skill-chip')].find(b => /当【火杀】/.test(b.textContent));
    if (btn) btn.click();
    return {
      chips,
      asId: UI.sel.asId,
      txt: document.getElementById('actionPrompt').textContent,
    };
  });
  OK(fire.chips.some(t => /当【火杀】/.test(t)), `出现「当【火杀】使用」按钮（${fire.chips.join(' / ')}）`);
  OK(fire.asId === 'huosha', '点击后按火【杀】处理');
  OK(/火杀/.test(fire.txt), `提示同步为火【杀】（${fire.txt}）`);

  const fired = await p.evaluate(() => {
    onSeatClick(1);
    onConfirm();
    const r = window.__got || {};
    return { asId: r.asId, targets: (r.targets || []).length };
  });
  OK(fired.asId === 'huosha' && fired.targets === 1, `提交 asId=huosha（${fired.asId}）`);

  /* ---------- 6. 朱雀：没装备就没有转化入口 ---------- */
  console.log('── 朱雀羽扇 · 反例');
  await bench('qinggang', ['sha']);
  const noFire = await p.evaluate(() => {
    onCardClick(G.players[0].hand[0]);
    return [...document.querySelectorAll('#skillBar .skill-chip')].map(b => b.textContent);
  });
  OK(!noFire.some(t => /火杀/.test(t)), '没装朱雀时没有火【杀】按钮');

  console.log(errs.length ? 'ERR ' + errs.join(' | ') : '  无报错');
  await b.close();
})();
