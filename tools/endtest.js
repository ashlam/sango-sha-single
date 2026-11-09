/* 结算弹窗 / 本机记忆 / 开局发牌 回归 */
const { chromium } = require('playwright-core');

let pass = 0, fail = 0;
function OK(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];

  /* ---------- 1. 结算弹窗：查看战报 / 收起 / 再打开 ---------- */
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 6000 });
  await p.click('.hero .h-name');
  await p.waitForSelector('.seat .gcard', { timeout: 8000 });
  await p.waitForTimeout(400);

  await p.evaluate(() => { G.over = true; UI.gameOver('lord'); });
  await p.waitForTimeout(1100);
  let r = await p.evaluate(() => ({
    open: !document.getElementById('modal').classList.contains('hidden'),
    log: !!document.getElementById('mLog'),
    hide: !!document.getElementById('mHide'),
    again: !!document.getElementById('mAgain'),
    chip: !document.getElementById('resultChip').classList.contains('hidden'),
  }));
  OK(r.open && r.log && r.hide && r.again, '结算面板有三个按钮');
  OK(!r.chip, '面板打开时胶囊隐藏');

  await p.click('#mLog');
  await p.waitForTimeout(300);
  r = await p.evaluate(() => ({
    modal: !document.getElementById('modal').classList.contains('hidden'),
    log: !document.getElementById('logPanel').classList.contains('hidden'),
    logResult: !document.getElementById('logResult').classList.contains('hidden'),
    chip: !document.getElementById('resultChip').classList.contains('hidden'),
    rows: document.querySelectorAll('#logList .lg').length,
  }));
  OK(!r.modal && r.log && r.logResult, '查看战报：关结算、开战报、底栏出现「看结算」');
  OK(r.rows > 0, `战报有内容（${r.rows} 条）`);
  OK(!r.chip, '战报开着时不显示悬浮胶囊');

  await p.click('#logResult');
  await p.waitForTimeout(300);
  r = await p.evaluate(() => ({
    modal: !document.getElementById('modal').classList.contains('hidden'),
    log: !document.getElementById('logPanel').classList.contains('hidden'),
    logResult: !document.getElementById('logResult').classList.contains('hidden'),
  }));
  OK(r.modal && !r.log && !r.logResult, '战报底栏「看结算」能回到结算');

  await p.click('#mHide');
  await p.waitForTimeout(300);
  r = await p.evaluate(() => ({
    modal: !document.getElementById('modal').classList.contains('hidden'),
    chip: !document.getElementById('resultChip').classList.contains('hidden'),
  }));
  OK(!r.modal && r.chip, '收起后只剩悬浮胶囊');

  await p.click('#resultChip');
  await p.waitForTimeout(300);
  r = await p.evaluate(() => ({
    modal: !document.getElementById('modal').classList.contains('hidden'),
    chip: !document.getElementById('resultChip').classList.contains('hidden'),
  }));
  OK(r.modal && !r.chip, '胶囊能重新打开结算');

  await p.screenshot({ path: 'tools/e-result.png' });
  await p.close();

  /* ---------- 2. 本机记忆：人数 ---------- */
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
  p2.on('pageerror', e => errs.push(e.message));
  await p2.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
  const def = await p2.evaluate(() => document.getElementById('selCount').value);
  await p2.selectOption('#selCount', '8');
  await p2.click('#btnStart');
  await p2.waitForSelector('.hero', { timeout: 6000 });
  const saved = await p2.evaluate(() => JSON.parse(localStorage.getItem('sgs.settings.v1') || '{}'));
  OK(saved.playerCount === 8, `开局后记住人数（${JSON.stringify(saved)}）`);

  await p2.reload({ waitUntil: 'networkidle' });
  const after = await p2.evaluate(() => document.getElementById('selCount').value);
  OK(after === '8', `刷新后默认选中上次的人数（${after}，此前是 ${def}）`);
  await p2.close();

  /* ---------- 3. 开局发牌动画 ---------- */
  const p3 = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p3.on('pageerror', e => errs.push(e.message));
  await p3.goto('http://127.0.0.1:8000/?players=4&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p3.click('#btnStart');
  await p3.waitForSelector('.hero', { timeout: 6000 });
  const t0 = Date.now();
  await p3.click('.hero .h-name');
  await p3.waitForSelector('#dealLayer:not(.hidden)', { timeout: 3000 });
  await p3.waitForTimeout(700);
  const mid = await p3.evaluate(() => ({
    title: (document.querySelector('#dealTitle') || {}).textContent,
    fly: document.querySelectorAll('.deal-fly').length,
    hands: G.players.map(p => p.hand.length),
  }));
  OK(!!mid.title, `发牌时显示标题「${mid.title}」`);
  OK(mid.fly > 0, `有牌在飞（${mid.fly} 张）`);
  OK(mid.hands.reduce((a, b) => a + b, 0) < 16, '手牌是逐张发的，不是一次性到位');
  await p3.screenshot({ path: 'tools/e-deal.png' });

  await p3.waitForFunction(() => {
    const l = document.getElementById('dealLayer');
    return l.classList.contains('hidden') && G.players.every(p => p.hand.length === 4);
  }, { timeout: 15000 });
  const cost = Date.now() - t0;
  OK(cost > 1800, `发牌耗时 ${(cost / 1000).toFixed(1)}s（有仪式感）`);
  const done = await p3.evaluate(() => ({
    hands: G.players.map(p => p.hand.length),
    deck: G.deck.length,
    layer: document.getElementById('dealLayer').children.length,
    log: G.log.slice(-1).map(l => l.text),
  }));
  OK(done.hands.every(n => n === 4), '四人都拿到 4 张');
  OK(done.deck === 152 - 16, `牌堆剩 ${done.deck}`);
  OK(done.layer === 0, '发牌层已清空');
  await p3.screenshot({ path: 'tools/e-dealt.png' });
  await p3.close();

  /* ---------- 4. 快速模式不发牌动画 ---------- */
  const p4 = await b.newPage({ viewport: { width: 390, height: 844 } });
  p4.on('pageerror', e => errs.push(e.message));
  await p4.goto('http://127.0.0.1:8000/?fast=1&players=4&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p4.click('#btnStart');
  await p4.waitForSelector('.hero', { timeout: 6000 });
  await p4.click('.hero .h-name');
  await p4.waitForTimeout(250);
  const fast = await p4.evaluate(() => ({
    hidden: document.getElementById('dealLayer').classList.contains('hidden'),
    dealt: G.players.reduce((n, x) => n + x.hand.length, 0) >= 16,
    deck: G.deck.length,
  }));
  OK(fast.hidden && fast.dealt && fast.deck <= 136, '快速模式直接发完，无动画');
  await p4.close();

  /* ---------- 4. 轻触跳过发牌 ---------- */
  const p5 = await b.newPage({ viewport: { width: 390, height: 844 } });
  p5.on('pageerror', e => errs.push(e.message));
  await p5.goto('http://127.0.0.1:8000/?players=6&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p5.click('#btnStart');
  await p5.waitForSelector('.hero', { timeout: 6000 });
  await p5.click('.hero .h-name');
  await p5.waitForSelector('#dealLayer:not(.hidden)', { timeout: 4000 });
  await p5.waitForTimeout(500);
  const tSkip = Date.now();
  await p5.mouse.click(195, 500);
  await p5.waitForFunction(() => G.players.every(p => p.hand.length === 4), { timeout: 4000 });
  const skipCost = Date.now() - tSkip;
  OK(skipCost < 1200, `轻触可跳过发牌（${(skipCost / 1000).toFixed(1)}s 补齐）`);
  await p5.waitForTimeout(500);
  const skipState = await p5.evaluate(() => ({
    hidden: document.getElementById('dealLayer').classList.contains('hidden'),
    pointer: document.getElementById('dealLayer').style.pointerEvents,
  }));
  OK(skipState.hidden && skipState.pointer === 'none', '跳过后发牌层收起且不再吃点击');
  await p5.close();

  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 5).join('\n') : 'no page errors');
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
