'use strict';
/* 安卓适配回归：手机竖屏 / 手机横屏 / 平板竖屏 / 平板横屏
 *
 * 检查项：
 *   1. 没有横向溢出、没有元素跑出屏幕
 *   2. 对手武将卡两两不重叠，卡面不小于该档位的下限
 *   3. 手牌完整可见、可点（提示卡弹出时也不能被盖住）
 *   4. HUD 按钮、身份印章可点
 *   5. 操作栏（出牌阶段）在屏幕内、按钮够大
 *   6. 详情抽屉在屏幕内
 *
 * 用法：node tools/fit.js            全部
 *      node tools/fit.js 手机横屏    只跑名字含该词的分组
 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');

let pass = 0, fail = 0;
const OK = (c, m, extra) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m + (extra ? '  ← ' + extra : '')); }
};
const shot = n => path.join(os.tmpdir(), n);
const ONLY = process.argv[2] || '';

/* 设备档位：cardMin = 该尺寸下武将卡宽度的下限（太小的字读不清） */
const DEVICES = [
  { name: '手机竖屏 390×844', w: 390, h: 844, tier: 'phone-port', cardMin: 100, cardMin8: 68 },
  { name: '手机竖屏 360×800', w: 360, h: 800, tier: 'phone-port', cardMin: 92, cardMin8: 62 },
  { name: '手机横屏 640×360', w: 640, h: 360, tier: 'phone-land', cardMin: 80, cardMin8: 80 },
  { name: '手机横屏 720×360', w: 720, h: 360, tier: 'phone-land', cardMin: 90, cardMin8: 90 },
  { name: '手机横屏 844×390', w: 844, h: 390, tier: 'phone-land', cardMin: 96, cardMin8: 96 },
  { name: '手机横屏 915×412', w: 915, h: 412, tier: 'phone-land', cardMin: 96, cardMin8: 96 },
  { name: '手机横屏 932×430', w: 932, h: 430, tier: 'phone-land', cardMin: 96, cardMin8: 96 },
  { name: '平板竖屏 768×1024', w: 768, h: 1024, tier: 'pad-port', cardMin: 130, cardMin8: 120 },
  { name: '平板竖屏 800×1280', w: 800, h: 1280, tier: 'pad-port', cardMin: 130, cardMin8: 120 },
  { name: '平板横屏 1024×768', w: 1024, h: 768, tier: 'pad-land', cardMin: 130, cardMin8: 126 },
  { name: '平板横屏 1280×800', w: 1280, h: 800, tier: 'pad-land', cardMin: 130, cardMin8: 126 },
];

async function openGame(b, d, n) {
  const p = await b.newPage({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
  if (n) await p.selectOption('#selCount', String(n));
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 8000 });
  await p.click('.hero:first-child .h-name');
  await p.waitForSelector('.seat .gcard', { timeout: 8000 });
  // 等到每个座位都挂上身份印章，避免量到首帧的空壳
  await p.waitForFunction(() => document.querySelectorAll('#seats > .id-mark .id-badge').length
    === document.querySelectorAll('.seat').length, null, { timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(700);
  // 冻结引擎循环，保证测量期间版面稳定
  await p.evaluate(() => { G.responder = () => new Promise(() => {}); });
  // 冻结前可能正弹着某张提示卡（濒死/无懈…），先收掉，测的是牌桌本身
  await p.evaluate(() => { try { closeModal(); } catch (e) {} });
  await p.waitForTimeout(160);
  return { p, errs };
}

/* 版面快照：全部用真实包围盒 + 命中测试 */
const SNAP = () => {
  const R = e => {
    const r = e.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  };
  const hitOf = (r, pad) => {
    const el = document.elementFromPoint(r.l + r.w / 2, r.t + (pad || r.h / 2));
    return el;
  };
  const cards = [...document.querySelectorAll('.seat .gcard')].map(e => {
    const r = R(e);
    const nameEl = e.querySelector('.gc-name');
    return {
      ...r, seat: e.closest('.seat').dataset.seat,
      name: (nameEl || {}).textContent || '',
      font: nameEl ? parseFloat(getComputedStyle(nameEl).fontSize) : 0,
    };
  });
  const overlap = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], c = cards[j];
      const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l);
      const oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      if (ox > 2 && oy > 2) overlap.push(`${a.seat}-${c.seat}:${Math.round(ox)}x${Math.round(oy)}`);
    }
  }
  const outside = cards.filter(c => c.l < -1 || c.t < -1 || c.r > innerWidth + 1 || c.b > innerHeight + 1)
    .map(c => c.seat);

  const hand = [...document.querySelectorAll('#handArea .card')].map(e => {
    const r = R(e);
    const el = hitOf(r);
    return { ...r, covered: !el || !el.closest('#handArea') };
  });
  const handOut = hand.filter(c => c.l < -1 || c.t < -1 || c.r > innerWidth + 1 || c.b > innerHeight + 1).length;

  const hudBtns = ['#btnCodex', '#btnLog', '#btnMenu'].map(s => {
    const e = document.querySelector(s);
    if (!e) return { s, ok: false };
    const r = R(e);
    const el = hitOf(r);
    return { s, ok: !!el && (el === e || e.contains(el)), h: Math.round(r.h) };
  });

  const marks = [...document.querySelectorAll('#seats > .id-mark')].map(m => {
    const bd = m.querySelector('.id-badge');
    if (!bd) return { ok: false, seal: 'EMPTY' };
    const r = R(bd);
    const el = hitOf(r);
    return {
      ok: !!el && !!el.closest('.id-badge'),
      seal: (bd.querySelector('.ib-seal') || {}).textContent,
      box: [Math.round(r.l), Math.round(r.t)],
      hit: el ? (el.className || el.tagName) : 'none',
    };
  });

  const hud = R(document.getElementById('hud'));
  const self = R(document.getElementById('selfArea'));
  const seats = R(document.getElementById('seats'));
  const actionBar = document.getElementById('actionBar');
  const ab = actionBar.classList.contains('hidden') ? null : R(actionBar);

  return {
    vw: innerWidth, vh: innerHeight,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    cards, overlap, outside, hand, handOut, hudBtns, marks,
    hudBottom: hud.b, selfTop: self.t, selfBottom: self.b, seatsH: seats.h,
    actionBar: ab,
    gcardW: cards.length ? Math.round(cards[0].w) : 0,
    minFont: cards.length ? Math.min(...cards.map(c => c.font)) : 0,
    tier: (typeof viewTier === 'function') ? viewTier() : '?',
    handN: hand.length,
  };
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });

  /* ================= 一、静态版面（4 / 8 人局） ================= */
  for (const d of DEVICES) {
    if (ONLY && !d.name.includes(ONLY)) continue;
    for (const n of [4, 8]) {
      const { p, errs } = await openGame(b, d, n);
      const s = await p.evaluate(SNAP);
      console.log(`\n[${d.name} · ${n}人局] tier=${s.tier} 卡宽=${s.gcardW} 最小字=${s.minFont} 屏=%d×%d`.replace('%d×%d', `${s.vw}×${s.vh}`));

      OK(s.scrollW <= s.vw + 1, '无横向溢出', `scrollWidth=${s.scrollW}`);
      OK(s.overlap.length === 0, `${s.cards.length} 张对手卡互不重叠`, s.overlap.join(','));
      OK(s.outside.length === 0, '对手卡都在屏幕内', '越界座位 ' + s.outside.join(','));
      OK(s.cards.length === n - 1, `对手卡数量 ${n - 1}`);
      const minW = n === 8 ? (d.cardMin8 || d.cardMin) : d.cardMin;
      OK(s.gcardW >= minW, `武将卡宽度 ≥ ${minW}px`, `实际 ${s.gcardW}`);
      OK(s.minFont >= 10.5, '武将名字号 ≥10.5px', `实际 ${s.minFont}`);
      OK(s.handN > 0 && s.hand.every(c => !c.covered), '手牌完整可见且未被遮挡');
      OK(s.handOut === 0, '手牌都在屏幕内');
      OK(s.hudBtns.every(x => x.ok && x.h >= 26), 'HUD 三个按钮可点且够大', JSON.stringify(s.hudBtns));
      OK(s.marks.length === s.cards.length && s.marks.every(m => m.ok), '身份印章都可见可点',
        JSON.stringify(s.marks));
      OK(s.selfTop >= s.hudBottom - 1, '自己的区域没有盖住顶栏');
      OK(s.selfBottom <= s.vh + 1, '自己的区域在屏幕内');
      OK(errs.length === 0, '无页面报错', errs[0]);
      await p.screenshot({ path: shot(`fit-${d.w}x${d.h}-${n}.png`) });
      await p.close();
    }
  }

  /* ================= 二、提示卡：不能压住手牌 ================= */
  const PROMPT_CASES = ONLY
    ? DEVICES.filter(d => d.name.includes(ONLY))
    : DEVICES.filter(d => ['phone-land', 'pad-land', 'pad-port'].includes(d.tier) || d.w === 390);

  for (const d of PROMPT_CASES) {
    const { p } = await openGame(b, d, 8);
    await p.evaluate(() => {
      UI.prompt(G.players[0], {
        kind: 'yesno', skill: 'guicai',
        prompt: '马超 判定为 ♥5 · 赤兔，是否打出一张手牌代替？',
      });
    });
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => {
      const box = document.getElementById('modalBox').getBoundingClientRect();
      const hand = document.getElementById('handArea').getBoundingClientRect();
      const row = document.getElementById('selfRow').getBoundingClientRect();
      const inside = box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
      const hs = [...document.querySelectorAll('#handArea .card')].map(e => {
        const b = e.getBoundingClientRect();
        const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { covered: !el || !el.closest('#handArea'), t: b.top };
      });
      return {
        inside, h: Math.round(box.height), w: Math.round(box.width),
        overlapHand: box.bottom > hand.top + 2,
        overlapRow: box.bottom > row.top + 2,
        handCovered: hs.filter(x => x.covered).length,
        compact: document.getElementById('modalBox').classList.contains('compact'),
      };
    });
    console.log(`\n[${d.name} · 是/否提示卡] 尺寸 ${r.w}×${r.h} 横排=${r.compact}`);
    OK(r.inside, '提示卡完整在屏幕内');
    OK(!r.overlapHand, '提示卡没有压住手牌', `卡片底 ${Math.round(r.overlapHand ? 1 : 0)}`);
    OK(r.handCovered === 0, '提示卡弹出时手牌仍可点', `${r.handCovered} 张被盖`);
    if (d.tier === 'phone-land') OK(!r.overlapRow, '横屏提示卡没有压住自己的武将栏');
    await p.screenshot({ path: shot(`fit-prompt-${d.w}x${d.h}.png`) });
    await p.close();
  }

  /* ================= 三、详情抽屉在屏幕内 ================= */
  for (const d of (ONLY ? DEVICES.filter(x => x.name.includes(ONLY)) : [DEVICES[0], DEVICES[4], DEVICES[9]])) {
    const { p } = await openGame(b, d, 8);
    await p.evaluate(() => openCodex('rules'));
    await p.waitForTimeout(520);   // 等抽屉上滑动画结束
    const r = await p.evaluate(() => {
      const pan = document.getElementById('sheetPanel').getBoundingClientRect();
      return {
        h: Math.round(pan.height), inside: pan.top >= -1 && pan.bottom <= innerHeight + 1,
        scrollable: document.getElementById('sheetBody').scrollHeight > document.getElementById('sheetBody').clientHeight,
        ratio: pan.height / innerHeight,
      };
    });
    console.log(`\n[${d.name} · 详情抽屉] 高 ${r.h}（占屏 ${Math.round(r.ratio * 100)}%）`);
    OK(r.inside, '抽屉在屏幕内');
    OK(r.ratio <= 0.95, '抽屉没有占满整屏');
    await p.close();
  }

  await b.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
