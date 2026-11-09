'use strict';
/* 浏览器回归：真实对局里走到弃牌阶段，检查标题 / 进度 / 按钮 / 结果 */
const { chromium } = require('playwright-core');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const OK = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const shot = (name) => path.join(os.tmpdir(), name);

(async () => {
  const W = +(process.env.W || 390), HGT = +(process.env.H || 844);
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: W, height: HGT }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 6000 });
  // 避开吕蒙（克己会跳过弃牌阶段）
  const hero = await p.evaluate(() => {
    const hs = [...document.querySelectorAll('.hero')];
    const i = hs.findIndex(h => !(h.textContent || '').includes('吕蒙'));
    return i < 0 ? 0 : i;
  });
  await p.evaluate(i => document.querySelectorAll('.hero')[i].click(), hero);
  await p.waitForSelector('.seat .gcard', { timeout: 8000 });
  await p.waitForTimeout(250);

  // 除了「出牌 / 弃牌」之外全部交给 AI，让玩家尽快走到弃牌阶段
  await p.evaluate(() => {
    setInterval(() => {
      const r = UI.req;
      if (!r || r.kind === 'play' || r.kind === 'discard') return;
      const pl = UI.player, fn = UI.resolve;
      Promise.resolve(AI.decide(pl, r)).then(res => {
        UI.req = null; UI.player = null; UI.resolve = null;
        document.getElementById('modal').classList.add('hidden');
        if (fn) fn(res);
      });
    }, 60);
  });

  const snap = () => p.evaluate(() => ({
    title: (document.querySelector('#actionPrompt .ap-title') || {}).textContent || '',
    text: (document.querySelector('#actionPrompt .ap-txt') || {}).textContent || '',
    count: (document.querySelector('#actionPrompt .ap-count') || {}).textContent || '',
    btn: document.getElementById('btnConfirm').textContent,
    disabled: document.getElementById('btnConfirm').disabled,
    cancelHidden: document.getElementById('btnCancel').classList.contains('hidden'),
    barVisible: !document.getElementById('actionBar').classList.contains('hidden'),
    overflow: document.getElementById('actionBar').scrollWidth - document.getElementById('actionBar').clientWidth,
    need: UI.req ? UI.req.min : 0,
    limit: UI.req ? UI.req.limit : null,
    hand: G.players[0].hand.length,
  }));

  let s = null;
  for (let i = 0; i < 500 && !s; i++) {
    const st = await p.evaluate(() => ({ kind: UI.req && UI.req.kind, over: G.over, phase: G.phase }));
    if (st.over) break;
    if (st.kind === 'play') {
      await p.click('#btnCancel');                 // 结束出牌 → 手牌超限
      await p.waitForTimeout(90);
      continue;
    }
    if (st.kind === 'discard') {
      const isPhase = await p.evaluate(() => UI.req && UI.req.limit != null);
      if (!isPhase) {                             // 技能触发的弃牌：AI 代打
        await p.evaluate(() => {
          const r = UI.req, pl = UI.player, fn = UI.resolve;
          const res = AI.decide(pl, r);
          UI.req = null; UI.player = null; UI.resolve = null;
          if (fn) fn(res);
        });
        await p.waitForTimeout(90);
        continue;
      }
      s = await snap();
      break;
    }
    await p.waitForTimeout(80);
  }

  if (!s) {
    console.log('  ✗ 没能走到玩家的弃牌阶段（对局提前结束或未触发）');
    console.log('ERRORS:', errs.slice(0, 5));
    await b.close();
    process.exit(1);
  }

  console.log('\n── 弃牌阶段：操作提示 ──');
  OK(s.barVisible, '操作栏可见');
  OK(s.title === '弃牌', `有「弃牌」标题（实际：${s.title}）`);
  OK(s.text.includes(`请选择 ${s.need} 张手牌丢弃`), `写明请丢弃 ${s.need} 张（${s.text}）`);
  OK(s.text.includes(`上限 ${s.limit}`), '写明手牌上限');
  OK(s.count.includes(`已选 0/${s.need}`) && s.count.includes(`还需 ${s.need} 张`), `显示进度（${s.count}）`);
  OK(s.btn === '弃牌', `确定按钮写作「弃牌」（实际：${s.btn}）`);
  OK(s.disabled, '未选够时确定按钮禁用');
  OK(s.cancelHidden, '弃牌阶段隐藏「取消」（不能赖掉）');
  OK(s.overflow <= 2, `操作栏没有横向溢出（${s.overflow}px）`);

  await p.screenshot({ path: shot('sgs-discard-start.png') });

  // 逐张点选，检查进度与文字是否稳定
  const firstText = s.text;
  for (let k = 1; k <= s.need; k++) {
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('#handArea .card')]
        .find(e => !e.classList.contains('disabled') && !e.classList.contains('sel'));
      if (el) el.click();
    });
    await p.waitForTimeout(70);
    const t = await snap();
    OK(t.text === firstText, `选第 ${k} 张后主提示仍说明「为什么弃牌」`);
    OK(t.count.includes(`已选 ${k}/${s.need}`), `进度更新到 ${k}/${s.need}（${t.count}）`);
    if (k === s.need) {
      OK(!t.disabled, '选够后按钮可用');
      OK(t.count.includes('点「弃牌」确定'), `提示点弃牌（${t.count}）`);
    } else {
      OK(t.disabled, '还没选够时按钮仍禁用');
    }
  }
  await p.screenshot({ path: shot('sgs-discard-selected.png') });

  // 冻结后续回合：fast 模式下 AI 会瞬间接着行动，可能又拆掉玩家一张牌，
  // 导致「弃牌后手牌数」采样到下一回合的状态。
  await p.evaluate(() => { G.responder = () => new Promise(() => {}); });
  await p.click('#btnConfirm');
  await p.waitForTimeout(200);
  const after = await p.evaluate(() => ({
    hand: G.players[0].hand.length,
    req: UI.req && UI.req.kind,
    discards: G.discard.length,
  }));
  OK(after.hand === s.limit, `弃牌后手牌 = 上限 ${s.limit}（实际 ${after.hand}）`);
  OK(!after.req, '弃牌请求已结束');
  OK(errs.length === 0, `无页面报错（${errs.slice(0, 3).join(' | ') || 'none'}）`);

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  console.log('截图：' + shot('sgs-discard-start.png') + ' , ' + shot('sgs-discard-selected.png'));
  await b.close();
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
