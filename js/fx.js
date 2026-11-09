'use strict';
/* ================= 桌面表现层 =================
 * 把「谁 对 谁 做了什么」直接画在牌桌上，不用翻战报也能看懂：
 *   FX.act(演员, [目标], 标签)  指向线（谁 → 谁，用的什么牌）+ 行动者高亮
 *   FX.hit(座位, '-1', 'dmg')   命中飘字 + 卡牌红圈
 *   FX.heal(座位, 2)            回复飘字 + 取消濒死
 *   FX.dying(座位)              濒死：血雾 + 红圈 + 「濒死」标记
 *   FX.death(座位)              阵亡：压暗 + 「阵亡」标记
 * 只在浏览器里用；Node 单测不加载本文件。 */

const FX = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const MAX_TARGETS = 4;        // 群体锦囊最多画 4 条，再多就太乱
  let layer = null, board = null, danger = null;

  /* ---------- DOM 基座 ---------- */
  function root() {
    if (!layer || !layer.isConnected) layer = document.getElementById('fxLayer');
    return layer;
  }

  function mk(tag, cls, txt) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (txt != null) el.textContent = txt;
    return el;
  }

  function ns(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function svg() {
    if (board && board.isConnected) return board;
    const r = root();
    if (!r) return null;
    board = ns('svg', { class: 'fx-svg' });
    r.appendChild(board);
    return board;
  }

  /* ---------- 座位定位 ---------- */
  function cardOf(seat) {
    if (seat === 0) return document.getElementById('selfGeneral');
    const el = window.UI && UI.seatEls && UI.seatEls[seat];
    return el ? (el.querySelector('.gcard') || el) : null;
  }

  function center(seat) {
    const el = cardOf(seat);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  function place(el, c, pad) {
    const p = pad || 0;
    el.style.left = c.x + 'px';
    el.style.top = c.y + 'px';
    el.style.width = (c.w + p * 2) + 'px';
    el.style.height = (c.h + p * 2) + 'px';
  }

  /* ---------- 曲线 ---------- */
  function shift(p, c, pad) {
    const dx = c.x - p.x, dy = c.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / l) * pad, y: p.y + (dy / l) * pad };
  }

  function bez(a, c, b, t) {
    const m = 1 - t;
    return {
      x: m * m * a.x + 2 * m * t * c.x + t * t * b.x,
      y: m * m * a.y + 2 * m * t * c.y + t * t * b.y,
    };
  }

  function draw(a, b, kind, label, life, bend) {
    const v = svg();
    if (!v) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const c = { x: (a.x + b.x) / 2 - (dy / len) * bend, y: (a.y + b.y) / 2 + (dx / len) * bend };
    // 两端收进来一点，别压在武将卡的字上
    const p0 = shift(a, c, Math.min(26, len * 0.2));
    const p1 = shift(b, c, Math.min(38, len * 0.28));

    const g = ns('g', { class: 'fx-g ' + kind });
    g.appendChild(ns('path', { class: 'fx-line ' + kind, d: `M${p0.x},${p0.y} Q${c.x},${c.y} ${p1.x},${p1.y}` }));
    const ang = Math.atan2(p1.y - c.y, p1.x - c.x);
    const s = 9;
    g.appendChild(ns('polygon', {
      class: 'fx-head ' + kind,
      points: `${p1.x},${p1.y} `
        + `${p1.x - s * Math.cos(ang - .42)},${p1.y - s * Math.sin(ang - .42)} `
        + `${p1.x - s * Math.cos(ang + .42)},${p1.y - s * Math.sin(ang + .42)}`,
    }));
    g.appendChild(ns('circle', { class: 'fx-dot ' + kind, cx: p0.x, cy: p0.y, r: 3.5 }));
    v.appendChild(g);

    let lb = null;
    if (label) {
      // 标签靠目标一侧（0.78），别落在屏幕正中压住动作横幅
      const m = bez(p0, c, p1, .78);
      lb = mk('div', 'fx-label ' + kind, label);
      lb.style.left = Math.max(46, Math.min(window.innerWidth - 46, m.x)) + 'px';
      lb.style.top = Math.max(64, Math.min(window.innerHeight - 90, m.y - 12)) + 'px';
      root().appendChild(lb);
    }

    setTimeout(() => {
      g.classList.add('out');
      if (lb) lb.classList.add('out');
      setTimeout(() => { g.remove(); if (lb) lb.remove(); }, 280);
    }, life || 900);
  }

  /* ---------- 行动者高亮 ---------- */
  function ring(seat, cls, ms) {
    const c = center(seat), r = root();
    if (!c || !r) return null;
    const el = mk('div', 'fx-ring ' + cls);
    place(el, c, 8);
    r.appendChild(el);
    if (ms) setTimeout(() => el.remove(), ms);
    return el;
  }

  /* ---------- 对外 ---------- */
  /* 一次行动：从行动者指向所有受影响的目标。
     目标 ≥3（南蛮/万箭/五谷这类）不画放射状箭头——会糊满整张桌子，
     改成给每个目标套一圈金光。 */
  function act(from, targets, label, opt) {
    opt = opt || {};
    if (!from) return;
    const a = center(from.seat);
    if (!a) return;
    ring(from.seat, 'actor', 900);
    const all = (targets || []).filter(t => t && t.seat !== from.seat);
    if (all.length >= 3) {
      all.forEach(t => ring(t.seat, 'hit', 950));
      return;
    }
    all.slice(0, MAX_TARGETS).forEach((t, i) => {
      const b = center(t.seat);
      if (!b) return;
      const sign = i % 2 === 0 ? 1 : -1;
      draw(a, b, opt.kind || 'act', i === 0 ? (label || '') : '',
        opt.life || 900, sign * 30);
    });
  }

  function hit(seat, text, kind) {
    const c = center(seat), r = root();
    if (!c || !r) return;
    const k = kind || 'dmg';
    const el = mk('div', 'fx-hit ' + k, text);
    el.style.left = c.x + 'px';
    el.style.top = (c.y - c.h * 0.3) + 'px';   // 偏上一点，别盖住体力灯
    r.appendChild(el);
    ring(seat, k, 620);
    setTimeout(() => el.remove(), 1150);
  }

  function heal(seat, n) {
    clearDanger();
    hit(seat, '+' + (n || 1), 'heal');
  }

  /* 「濒死 / 阵亡」这类贴在武将卡上的小牌。
     卡在顶排时上方没有空间（会被 HUD / 引导条压住），改挂到卡下面 */
  function attachTag(seat, cls, txt) {
    const c = center(seat), r = root();
    const tag = mk('div', 'fx-tag ' + cls, txt);
    if (seat === 0) {
      // 自己：卡在底部手牌区，标签贴着卡会糊住手牌，改成桌面正中一句
      tag.classList.add('mid');
      tag.style.left = '50%';
      tag.style.top = '40%';
    } else if (c) {
      const above = c.y - c.h / 2 - 14;
      tag.style.left = c.x + 'px';
      if (above < 112) {
        tag.classList.add('below');
        tag.style.top = (c.y + c.h / 2 + 10) + 'px';
      } else {
        tag.style.top = above + 'px';
      }
    } else {
      tag.style.left = '50%';
      tag.style.top = '38%';
    }
    if (r) r.appendChild(tag);
    return tag;
  }

  function dying(seat) {
    clearDanger();
    const r = root();
    if (!r) return;
    const box = mk('div', 'fx-danger');
    box.appendChild(mk('div', 'fx-vig'));
    const tag = attachTag(seat, 'danger', '濒死');
    box.appendChild(tag);
    const rg = ring(seat, 'dying');
    if (rg) box._ring = rg;
    r.appendChild(box);
    danger = box;
  }

  function clearDanger() {
    if (danger) {
      if (danger._ring) danger._ring.remove();
      danger.remove();
      danger = null;
    }
  }

  function death(seat) {
    clearDanger();
    const tag = attachTag(seat, 'death', '阵亡');
    ring(seat, 'death', 1200);
    setTimeout(() => tag.remove(), 1300);
  }

  /* 换局 / 回主菜单时清干净 */
  function clear() {
    clearDanger();
    const r = root();
    if (r) r.innerHTML = '';
    board = null;
  }

  return { act, hit, heal, dying, clearDanger, death, clear };
})();

window.FX = FX;
