'use strict';
/* 浏览器回归：身份信息在 HUD / 座位 / 自己武将卡 / 选将 / 详情 / 规则 / 战报 / 结算里
   是否统一、醒目、可点、不被遮挡。用法：node tools/idtest.js */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');

let pass = 0, fail = 0;
const OK = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const shot = n => path.join(os.tmpdir(), n);

const MARKS = { lord: '主', loyal: '忠', rebel: '反', spy: '内', unknown: '?' };
const CNS = { lord: '主公', loyal: '忠臣', rebel: '反贼', spy: '内奸' };

async function openGame(b, vp, n) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.selectOption('#selCount', String(n));
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 8000 });
  return { p, errs };
}

async function sheetState(p) {
  return p.evaluate(() => ({
    open: !document.getElementById('sheet').classList.contains('hidden'),
    title: (document.querySelector('.sheet-title') || {}).textContent || '',
    sub: (document.querySelector('.sheet-sub') || {}).textContent || '',
    txt: (document.getElementById('sheetPanel') || {}).innerText || '',
    rules: document.querySelectorAll('#sheetBody .id-rule').length,
    badges: document.querySelectorAll('#sheetBody .id-badge').length,
  }));
}
async function closeSheet(p) {
  await p.evaluate(() => document.getElementById('sheetClose').click());
  await p.waitForTimeout(60);
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });

  /* ---------- 主流程：390 竖屏 4 人局，覆盖全部交互 ---------- */
  {
    const { p, errs } = await openGame(b, { width: 390, height: 844 }, 4);
    const pick = await p.evaluate(() => ({
      id: G.players[0].identity,
      badge: !!document.querySelector('#modal .id-badge.with-goal'),
      seal: (document.querySelector('#modal .ib-seal') || {}).textContent,
      goal: (document.querySelector('#modal .ib-goal') || {}).textContent,
      note: (document.querySelector('.pick-id-note') || {}).textContent,
    }));
    OK(pick.badge && pick.seal === MARKS[pick.id], `选将弹窗显示大号身份牌「${pick.seal}」`);
    OK(pick.goal && pick.goal.length > 6, '选将弹窗写出该身份的胜利条件');
    OK(pick.note && pick.note.includes('你的身份'), '选将弹窗附带身份说明');

    // 点身份牌 → 身份抽屉
    await p.evaluate(() => document.querySelector('#modal .id-badge[data-inspect]').click());
    await p.waitForTimeout(80);
    let s = await sheetState(p);
    OK(s.open && s.title.includes('身份与胜利条件'), '点选将身份牌 → 打开身份抽屉');
    OK(s.rules === 4, '抽屉列出四种身份与胜利条件');
    await closeSheet(p);

    await p.click('.hero:first-child .h-name');
    await p.waitForSelector('#seats > .id-mark .id-badge', { timeout: 8000 });
    // 冻结引擎循环，避免 AI 连续重绘影响 DOM 断言；
    // 身份是随机的，主流程固定让主公坐在对手席，才能测到「公开的金色主印章」
    await p.evaluate(() => {
      G.responder = () => new Promise(() => {});
      const i = G.players.findIndex(x => x.identity === 'lord');
      if (i === 0) { G.players[0].identity = 'rebel'; G.players[1].identity = 'lord'; }
      UI.render();
    });
    await p.waitForTimeout(900); // 等动作横幅/飘字等临时层散去，再检查常驻身份印章

    const base = await p.evaluate(() => {
      const ids = G.players.map(x => x.identity);
      const hud = document.querySelector('#hudIdentity .id-badge');
      const self = document.querySelector('#selfIdentity .id-badge');
      const marks = [...document.querySelectorAll('.seat')].map(el => {
        const bd = document.querySelector(`#seats > .id-mark[data-seat="${el.dataset.seat}"] .id-badge`);
        const r = bd && bd.getBoundingClientRect();
        const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
        return {
          seat: +el.dataset.seat,
          cls: bd ? bd.className : '',
          seal: bd ? bd.querySelector('.ib-seal').textContent : '',
          box: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
          tappable: !!(hit && hit.closest('.id-badge')),
        };
      });
      return {
        ids,
        hud: hud ? { cls: hud.className, txt: hud.innerText, tap: !!hud.dataset.tap } : null,
        self: self ? { cls: self.className, seal: self.querySelector('.ib-seal').textContent } : null,
        lordCard: document.querySelectorAll('.seat .gcard.is-lord').length,
        marks,
        overflow: marks.filter(m => m.box && (m.box[0] < 0 || m.box[0] + m.box[2] > innerWidth)).length,
      };
    });
    const lordSeat = base.ids.indexOf('lord');
    OK(base.hud && base.hud.cls.includes('id-' + base.ids[0]) && base.hud.txt.includes(CNS[base.ids[0]]),
      `HUD 用彩色身份牌显示「${CNS[base.ids[0]]}」`);
    OK(base.hud && base.hud.tap, 'HUD 身份牌可点看详情');
    OK(base.self && base.self.seal === MARKS[base.ids[0]], '自己武将卡左侧有同款身份印章');
    OK(base.lordCard === 1, '主公武将卡有专属金色边框');
    OK(base.marks.length === 3, '三个对手各有一枚身份印章');
    OK(base.marks.every(m => m.cls.includes('id-' + (m.seat === lordSeat ? 'lord' : 'unknown'))),
      '主公显示金色「主」，其余显示灰色「?」（身份未明也是明确信息）');
    OK(base.marks.every(m => m.seal === (m.seat === lordSeat ? '主' : '?')), '印章字与身份状态一致');
    OK(base.marks.every(m => m.box && m.box[2] >= 20 && m.box[3] >= 20), '印章尺寸不小于 20px，肉眼可辨');
    OK(base.marks.every(m => m.tappable), '每枚印章都可点（没有被卡面/提示条盖住）');
    OK(base.overflow === 0, '印章不出血');

    // HUD 身份牌
    const myGoal = await p.evaluate(id => IDENTITY_META[id].goal, base.ids[0]);
    await p.evaluate(() => document.querySelector('#hudIdentity .id-badge').click());
    await p.waitForTimeout(80);
    s = await sheetState(p);
    OK(s.open && s.title.includes('身份与胜利条件') && s.rules === 4, '点 HUD 身份牌 → 打开四种身份说明');
    OK(s.txt.includes(myGoal), '抽屉写出自己的胜利条件');
    OK(s.txt.includes('主公') && s.txt.includes('忠臣') && s.txt.includes('反贼') && s.txt.includes('内奸'),
      '抽屉同时列出四种阵营');
    await p.screenshot({ path: shot('sgs-id-sheet.png') });
    await closeSheet(p);

    // 未知角色 / 主公角色
    const unkSeat = base.marks.find(m => m.seat !== lordSeat).seat;
    await p.evaluate(st => document.querySelector(`#seats > .id-mark[data-seat="${st}"] .id-badge`).click(), unkSeat);
    await p.waitForTimeout(80);
    s = await sheetState(p);
    OK(s.open && s.txt.includes('身份未明') && s.sub.includes('身份未明'), '点未知印章 → 说明「身份未明 / 阵亡后公开」');
    await closeSheet(p);
    await p.evaluate(st => document.querySelector(`#seats > .id-mark[data-seat="${st}"] .id-badge`).click(), lordSeat);
    await p.waitForTimeout(80);
    s = await sheetState(p);
    OK(s.open && s.txt.includes('身份已公开') && s.sub.includes('主公'), '点主公印章 → 说明主公身份公开');
    await closeSheet(p);

    /* ---- 身份标记：玩家自己记「我认为他是谁」 ---- */
    const realId = await p.evaluate(st => G.players.find(x => x.seat === st).identity, unkSeat);
    await p.evaluate(st => document.querySelector(`#seats > .id-mark[data-seat="${st}"] .id-badge`).click(), unkSeat);
    await p.waitForTimeout(80);
    const gbtns = await p.evaluate(() => ({
      n: document.querySelectorAll('#sheetBody .guess-btn').length,
      hasClear: !!document.querySelector('#sheetBody .guess-btn.clr'),
      stackBack: getComputedStyle(document.getElementById('sheetBack')).visibility,
    }));
    OK(gbtns.n === 5 && gbtns.hasClear, '身份抽屉里有 4 个身份 + 清除，共 5 个标记按钮');

    await p.evaluate(() => document.querySelector('#sheetBody .guess-btn[data-guess="rebel"]').click());
    await p.waitForTimeout(140);
    const marked = await p.evaluate(st => {
      const bd = document.querySelector(`#seats > .id-mark[data-seat="${st}"] .id-badge`);
      const r = bd.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        guess: G.guess[st],
        real: G.players.find(x => x.seat === st).identity,
        cls: bd.className,
        seal: bd.querySelector('.ib-seal').textContent,
        puck: !!bd.querySelector('.ib-q'),
        tappable: !!(el && el.closest('.id-badge')),
        back: getComputedStyle(document.getElementById('sheetBack')).visibility,
      };
    }, unkSeat);
    OK(marked.guess === 'rebel', '点「反贼」→ 记进 G.guess');
    OK(marked.seal === '反' && marked.cls.includes('id-rebel'), '座位上的灰色问号变成红色「反」');
    OK(marked.puck, '印章带「?」角标，一眼看出是玩家标记');
    OK(marked.real === realId, '标记不改变真实身份');
    OK(marked.back === 'hidden', '抽屉原地刷新，没有多出一层返回');

    s = await sheetState(p);
    OK(s.open && s.txt.includes('你标记为「反贼」'), '抽屉里写明「你标记为反贼（猜测）」');
    OK(await p.evaluate(() => document.querySelectorAll('#sheetBody .id-rule.mine').length) === 1,
      '四种身份列表里标出「我的标记」那一条');
    await p.screenshot({ path: shot('sgs-id-guess.png') });

    // 重绘后仍在
    const kept = await p.evaluate(st => {
      UI.render();
      return document.querySelector(`#seats > .id-mark[data-seat="${st}"] .id-badge`).querySelector('.ib-seal').textContent;
    }, unkSeat);
    OK(kept === '反', '刷新牌桌后标记仍然保留');

    // 武将详情里也看得到
    await closeSheet(p);
    const tapAfter = await p.evaluate(st => {
      const bd = document.querySelector(`#seats > .id-mark[data-seat="${st}"] .id-badge`);
      const r = bd.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!(el && el.closest('.id-badge'));
    }, unkSeat);
    OK(tapAfter, '标记后的印章仍可点开（多出的「?」角标不吃点击）');
    await p.evaluate(st => openGeneralSheet(G.players.find(x => x.seat === st)), unkSeat);
    await p.waitForTimeout(80);
    s = await sheetState(p);
    OK(s.open && s.txt.includes('你的标记：反贼'), '武将详情里写出「你的标记：反贼」');
    await closeSheet(p);

    // 清除
    await p.evaluate(st => document.querySelector(`#seats > .id-mark[data-seat="${st}"] .id-badge`).click(), unkSeat);
    await p.waitForTimeout(80);
    await p.evaluate(() => document.querySelector('#sheetBody .guess-btn.clr').click());
    await p.waitForTimeout(140);
    const cleared = await p.evaluate(st => ({
      g: G.guess[st],
      seal: document.querySelector(`#seats > .id-mark[data-seat="${st}"] .id-badge`).querySelector('.ib-seal').textContent,
      puck: !!document.querySelector(`#seats > .id-mark[data-seat="${st}"] .ib-q`),
    }), unkSeat);
    OK(!cleared.g && cleared.seal === '?' && !cleared.puck, '清除标记后恢复灰色问号、角标消失');
    await closeSheet(p);

    // 武将详情抽屉里的身份信息
    await p.evaluate(() => document.querySelector('#selfGeneral').click());
    await p.waitForTimeout(80);
    s = await sheetState(p);
    OK(s.open && s.badges >= 1 && s.txt.includes(CNS[base.ids[0]]), '自己的武将详情里有身份牌');
    OK(s.txt.includes(myGoal), '武将详情里写出该身份目标');
    await closeSheet(p);

    // 阵亡后公开
    const revealed = await p.evaluate(st => {
      const q = G.players.find(x => x.seat === st);
      q.alive = false; q.hp = 0;
      UI.render();
      const bd = document.querySelector(`#seats > .id-mark[data-seat="${st}"] .id-badge`);
      return { id: q.identity, cls: bd.className, seal: bd.querySelector('.ib-seal').textContent };
    }, unkSeat);
    OK(revealed.cls.includes('id-' + revealed.id) && revealed.seal === MARKS[revealed.id],
      `阵亡后灰色「?」变成「${MARKS[revealed.id]}·${CNS[revealed.id]}」`);

    // 战报里的阵亡身份着色
    const lg = await p.evaluate(() => logHtml('甲 阵亡（反贼）'));
    OK(lg.includes('lg-id lg-rebel'), '战报里的「（反贼）」按阵营色高亮');

    // 图鉴 → 规则
    await p.click('#btnCodex');
    await p.waitForTimeout(80);
    await p.click('.cx-tab[data-cx="rules"]');
    await p.waitForTimeout(80);
    const rk = await p.evaluate(() => ({
      idRows: document.querySelectorAll('#codexBody .rk-id').length,
      badges: document.querySelectorAll('#codexBody .rk-id .id-badge').length,
      seals: [...document.querySelectorAll('#codexBody .rk-id .ib-seal')].map(e => e.textContent).join(''),
    }));
    OK(rk.idRows === 4 && rk.badges === 4 && rk.seals === '主忠反内', '规则页四种身份都用同款印章');
    await closeSheet(p);

    // 结算画面
    const res = await p.evaluate(() => {
      UI.gameOver('lord');
      const d = document.createElement('div');
      d.innerHTML = UI.resultHtml || '';
      return { badges: d.querySelectorAll('.id-badge.sm').length, n: G.players.length };
    });
    OK(res.badges === res.n, `结算名单 ${res.n} 人每人都带彩色身份牌`);

    OK(errs.length === 0, '主流程无页面报错' + (errs.length ? '：' + errs[0] : ''));
    await p.close();
  }

  /* ---------- 其余尺寸：4/8 人 + 窄屏 + 横屏的印章可见性 ---------- */
  for (const c of [{ w: 390, h: 844, n: 8 }, { w: 320, h: 640, n: 8 },
                   { w: 430, h: 932, n: 6 }, { w: 844, h: 390, n: 8 }]) {
    const { p, errs } = await openGame(b, { width: c.w, height: c.h }, c.n);
    if (c.w === 320) {
      const narrowPick = await p.evaluate(() => {
        const bd = document.querySelector('#modal .id-badge.with-goal');
        const box = (document.getElementById('modalBox') || document.getElementById('modal')).getBoundingClientRect();
        const r = bd.getBoundingClientRect();
        return { w: r.width, inside: r.left >= box.left - 1 && r.right <= box.right + 1,
          note: (document.querySelector('.pick-id-note') || {}).innerText || '' };
      });
      OK(narrowPick.inside && narrowPick.w > 200, '320 窄屏选将身份牌不溢出弹窗');
      await p.waitForTimeout(320); // 等 popIn 淡入结束，否则截图会拍到半透明弹窗
      await p.screenshot({ path: shot('sgs-id-pick-320.png') });
    }
    await p.click('.hero:first-child .h-name');
    await p.waitForSelector('#seats > .id-mark .id-badge', { timeout: 8000 });
    await p.evaluate(() => { G.responder = () => new Promise(() => {}); });
    await p.waitForTimeout(900); // 等动作横幅/飘字等临时层散去，再检查常驻身份印章
    const r = await p.evaluate(() => {
      const ids = G.players.map(x => x.identity);
      const lord = ids.indexOf('lord');
      const marks = [...document.querySelectorAll('#seats > .id-mark .id-badge')].map(bd => {
        const r = bd.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return {
          seal: bd.querySelector('.ib-seal').textContent,
          ok: !!(hit && hit.closest('.id-badge')),
          hit: hit ? String(hit.className || hit.tagName) : '(none)',
          x: Math.round(r.x), y: Math.round(r.y),
          inside: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        };
      });
      return {
        lord, marks,
        hud: !!document.querySelector('#hudIdentity .id-badge[data-tap]'),
        self: !!document.querySelector('#selfIdentity .id-badge[data-tap]'),
        bodyOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    const tag = `${c.w}×${c.h} ${c.n}人局`;
    OK(r.marks.length === c.n - 1, `${tag}：${c.n - 1} 个对手都挂了身份印章`);
    OK(r.marks.filter(m => m.seal === '主').length === (r.lord === 0 ? 0 : 1), `${tag}：恰好一枚主公印章`);
    const blocked = r.marks.filter(m => !m.ok);
    OK(blocked.length === 0, `${tag}：所有印章都能被点到（无遮挡）` +
      (blocked.length ? ' | ' + blocked.map(m => `@${m.x},${m.y} 被 ${m.hit} 盖住`).join('; ') : ''));
    OK(r.marks.every(m => m.inside), `${tag}：印章都在屏幕内`);
    OK(r.hud && r.self && !r.bodyOverflow, `${tag}：HUD/自己身份牌齐全，无横向溢出`);
    OK(errs.length === 0, `${tag}：无页面报错` + (errs.length ? '：' + errs[0] : ''));
    await p.screenshot({ path: shot(`sgs-id-${c.w}x${c.h}-${c.n}.png`) });
    await p.close();
  }

  await b.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 项`);
  process.exit(fail ? 1 : 0);
})();
