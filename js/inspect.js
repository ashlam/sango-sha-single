'use strict';
/* ============================================================
 *  三国杀 · 单机版   —— 信息层
 *
 *  设计目标：手机没有右键，规则说明不能藏在 title 属性里。
 *  参照昆特牌移动端的信息架构：
 *    1. 长按 = 检视（不打断主流程）
 *    2. 底部抽屉 = 详情（可层层深入）
 *    3. 图鉴 = 系统性查阅（卡牌 / 技能 / 规则）
 *    4. 就地 ⓘ = 解释当前上下文
 *    5. Coach = 分阶段引导
 * ============================================================ */

/* ================= 索引 ================= */

const CARD_ID_BY_NAME = {};
Object.keys(CARD_INFO).forEach(id => {
  const n = CARD_INFO[id].name;
  if (!CARD_ID_BY_NAME[n]) CARD_ID_BY_NAME[n] = id;
});

const SKILL_OWNERS = {};
GENERALS.forEach(g => g.skills.forEach(s => {
  (SKILL_OWNERS[s] = SKILL_OWNERS[s] || []).push(g.name);
}));

function findCardByUid(uid) {
  uid = +uid;
  if (!G || !G.players) return null;
  for (const p of G.players) {
    const h = p.hand.find(c => c.uid === uid); if (h) return h;
    for (const k of ['weapon', 'armor', 'horsePlus', 'horseMinus']) {
      const c = p.equip[k];
      if (c && c.uid === uid) return c;
    }
    const j = p.judgeZone.find(c => c.uid === uid); if (j) return j;
  }
  const d = G.discard.find(c => c.uid === uid); if (d) return d;
  return null;
}

/* ================= 文本工具 ================= */

/* 把描述里的【杀】【闪】等做成可点联查的词条 */
function linkify(text) {
  return String(text || '').replace(/【([^】]{1,8})】/g, (m, nm) => {
    const id = CARD_ID_BY_NAME[nm];
    if (!id) return m;
    return `<button class="kw" data-kw="${id}">【${nm}】</button>`;
  });
}

const SKILL_ID_BY_NAME = {};
Object.keys(SKILLS).forEach(id => {
  const n = SKILLS[id].name;
  if (n && !SKILL_ID_BY_NAME[n]) SKILL_ID_BY_NAME[n] = id;
});

/* 战报文本 → 可点的 HTML
 * 覆盖三种写法：「关羽」这样的武将名、「♥5·杀」这样的带花色牌、
 * 以及【杀】【集智】这类带书名号的牌名 / 技能名。*/
const SUIT_CODE = { '♠': 's', '♥': 'h', '♣': 'c', '♦': 'd' };

function cardTokMeta(tok) {          // "♥5·杀" → { id, suit, num }
  const m = /^([♠♥♣♦])(\d{1,2}|A|J|Q|K)·(.{1,8})$/.exec(tok);
  if (!m) return null;
  const id = CARD_ID_BY_NAME[m[3]];
  if (!id) return null;
  const num = { A: 1, J: 11, Q: 12, K: 13 }[m[2]] || +m[2] || 0;
  return { id: id, suit: SUIT_CODE[m[1]], num: num };
}

function logHtml(text) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const names = (G.players || [])
    .map(p => ({ n: p.name, seat: p.seat }))
    .filter(x => x.n)
    .sort((a, b) => b.n.length - a.n.length);

  let s = esc(text || '');

  // 1) 带花色的牌：♥5·杀 / ♠K·闪（引擎里 cardText 的写法）
  const toks = [];
  s = s.replace(/([♠♥♣♦](?:\d{1,2}|A|J|Q|K))·([\u4e00-\u9fa5A-Za-z]{1,8})/g, (m, sn, nm) => {
    const meta = cardTokMeta(sn + '·' + nm);
    if (!meta) return m;
    meta.txt = m;
    toks.push(meta);
    return `\u0001${toks.length - 1}\u0001`;
  });

  // 2) 【牌名】/【技能名】 + 3) 武将名
  const parts = s.split(/(【[^】]{1,10}】)/g);
  let out = '';
  for (const part of parts) {
    if (/^【[^】]{1,10}】$/.test(part)) {
      const nm = part.slice(1, -1);
      const cid = CARD_ID_BY_NAME[nm];
      const sid = cid ? null : SKILL_ID_BY_NAME[nm];
      if (cid) out += `<span class="lg-kw" data-k="card" data-id="${cid}">${part}</span>`;
      else if (sid) out += `<span class="lg-kw" data-k="skill" data-id="${sid}">${part}</span>`;
      else out += part;
      continue;
    }
    let t = part;
    for (const x of names) {
      if (t.indexOf(x.n) < 0) continue;
      t = t.split(x.n).join(`\u0000${x.seat}\u0000`);
    }
    t = t.replace(/\u0000(\d+)\u0000/g, (m, seat) => {
      const x = names.find(y => String(y.seat) === seat);
      return x ? `<span class="lg-who" data-seat="${x.seat}">${esc(x.n)}</span>` : m;
    });
    out += t;
  }

  // 4) 判定区里的牌名没有花色：判定区：乐不思蜀
  out = out.replace(/(判定区：)([\u4e00-\u9fa5]{1,8})/g, (m, pre, nm) => {
    const id = CARD_ID_BY_NAME[nm];
    return id ? `${pre}<span class="lg-kw" data-k="card" data-id="${id}">${nm}</span>` : m;
  });

  // 还原带花色的牌
  out = out.replace(/\u0001(\d+)\u0001/g, (m, i) => {
    const t = toks[+i];
    if (!t) return m;
    return `<span class="lg-kw" data-k="card" data-id="${t.id}" data-suit="${t.suit}" data-num="${t.num}">${esc(t.txt)}</span>`;
  });

  // 5) 阵亡时公开的身份：用阵营色标出来，和牌桌上的印章同色
  const idCls = { 主公: 'lord', 忠臣: 'loyal', 反贼: 'rebel', 内奸: 'spy' };
  out = out.replace(/（(主公|忠臣|反贼|内奸)）/g,
    (m, cn) => `<span class="lg-id lg-${idCls[cn]}">（${cn}）</span>`);
  return out;
}

/* 战报里点牌 / 点名字 */
function logTap(e) {
  const kw = e.target.closest ? e.target.closest('.lg-kw') : null;
  if (kw) {
    if (kw.dataset.k === 'card') {
      const hasSuit = !!kw.dataset.suit;
      openCardSheet({
        id: kw.dataset.id,
        suit: hasSuit ? kw.dataset.suit : 'none',
        num: hasSuit ? +kw.dataset.num : 0,
        uid: -1,
      }, { noStatus: true });
    } else {
      openSkillSheet(kw.dataset.id);
    }
    return;
  }
  const who = e.target.closest ? e.target.closest('.lg-who') : null;
  if (who) {
    const p = G.players.find(x => x.seat === +who.dataset.seat);
    if (p) openGeneralSheet(p);
  }
}

function skillType(sk) {
  if (!sk) return { txt: '技能', cls: '' };
  if (sk.lord) return { txt: '主公技', cls: 'lord' };
  if (sk.lock) return { txt: '锁定技', cls: 'lock' };
  if (sk.viewAs && !sk.active) return { txt: '转化技', cls: 'view' };
  if (sk.active) return { txt: '主动技', cls: 'act' };
  return { txt: '触发技', cls: 'trig' };
}

/* 从牌面说明推导出「什么时候能用」 */
function cardUsage(id) {
  const i = CARD_INFO[id];
  if (!i) return '';
  if (i.type === 'basic') {
    if (i.keyword === '杀') return '使用时机：出牌阶段，对攻击范围内的角色使用';
    if (i.keyword === '闪') return '使用时机：成为【杀】的目标时打出以抵消之';
    if (i.keyword === '桃') return '使用时机：出牌阶段自救，或有人濒死时救援';
    if (i.keyword === '酒') return '使用时机：出牌阶段令下一张【杀】伤害+1；濒死时自救';
    return '使用时机：出牌阶段';
  }
  if (i.type === 'trick') {
    if (i.delay) return '使用时机：出牌阶段，置于目标判定区，在其回合开始时结算';
    return '使用时机：出牌阶段（无懈可击则在锦囊生效前打出）';
  }
  if (i.type === 'equip') {
    if (i.sub === 'weapon') return '装备时机：出牌阶段，置于武器区（攻击范围 ' + (i.range || 1) + '）';
    if (i.sub === 'armor') return '装备时机：出牌阶段，置于防具区';
    return '装备时机：出牌阶段，置于坐骑区';
  }
  return '';
}

function cardTypeCn(id) {
  const i = CARD_INFO[id];
  if (!i) return '';
  if (i.type === 'basic') return '基本牌';
  if (i.type === 'trick') return i.delay ? '延时锦囊' : '锦囊牌';
  return i.sub === 'weapon' ? '武器' : i.sub === 'armor' ? '防具' : '坐骑';
}

/* ================= 底部抽屉 ================= */

const SHEET = {
  stack: [],
  open(html, opts) {
    opts = opts || {};
    this.stack.push({ html: html, opts: opts });
    this.paint();
  },
  back() {
    this.stack.pop();
    if (this.stack.length) this.paint();
    else this.close();
  },
  /* 原地换内容（比如在身份抽屉里点了「标记为反贼」，不想新增一层返回栈） */
  replace(html, opts) {
    this.stack.pop();
    this.open(html, opts);
  },
  close() {
    this.stack = [];
    const s = document.getElementById('sheet');
    if (s) s.classList.add('hidden');
    document.body.classList.remove('sheet-open');
  },
  isOpen() {
    return this.stack.length > 0;
  },
  paint() {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    const s = document.getElementById('sheet');
    const head = document.getElementById('sheetHead');
    const body = document.getElementById('sheetBody');
    if (!s) return;
    head.innerHTML = `
      <button class="sheet-back" id="sheetBack" ${this.stack.length > 1 ? '' : 'style="visibility:hidden"'}>‹</button>
      <div class="sheet-titles">
        <div class="sheet-title">${top.opts.title || ''}</div>
        <div class="sheet-sub">${top.opts.sub || ''}</div>
      </div>
      <button class="sheet-close" id="sheetClose">×</button>`;
    body.innerHTML = top.html;
    body.scrollTop = 0;
    s.classList.remove('hidden');
    document.body.classList.add('sheet-open');
    COACH.hide();
    if (top.opts.onMount) top.opts.onMount(body);
  },
};

function sheetClose() { SHEET.close(); }

/* ================= 手势层：长按检视 ================= */

const HOLD_MS = 380;
let lp = { timer: 0, el: null, x: 0, y: 0, firedAt: 0 };

function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { }
}

function initInspectGesture() {
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest) return;
    const el = e.target.closest('[data-inspect]');
    if (!el) return;
    if (document.getElementById('sheet') && !document.getElementById('sheet').classList.contains('hidden')) return;
    lp.el = el; lp.x = e.clientX; lp.y = e.clientY;
    el.classList.add('pressing');
    lp.timer = setTimeout(() => {
      if (!lp.el) return;
      lp.firedAt = Date.now();
      el.classList.remove('pressing');
      buzz(14);
      inspectByEl(el);
    }, HOLD_MS);
  }, { passive: true });

  document.addEventListener('pointermove', e => {
    if (!lp.el) return;
    if (Math.abs(e.clientX - lp.x) > 14 || Math.abs(e.clientY - lp.y) > 14) {
      clearTimeout(lp.timer);
      lp.el.classList.remove('pressing');
      lp.el = null;
    }
  }, { passive: true });

  const abort = () => {
    if (lp.timer) clearTimeout(lp.timer);
    if (lp.el) lp.el.classList.remove('pressing');
    lp.el = null;
  };
  document.addEventListener('pointerup', abort);
  document.addEventListener('pointercancel', abort);
  document.addEventListener('scroll', abort, { passive: true });

  // 1) 长按后吞掉随后的 click，避免误触发选中（用时间戳，600ms 后的点击不受影响）
  // 2) data-tap：纯信息元素（判定牌 / 装备槽 / 自己的武将卡）点一下就直接看详情，
  //    不必非得长按 380ms。出牌/选目标时的座位仍优先让给「选目标」。
  document.addEventListener('click', e => {
    if (lp.firedAt && Date.now() - lp.firedAt < 600) {
      lp.firedAt = 0;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    const tap = e.target.closest && e.target.closest('[data-tap]');
    if (!tap || !tap.dataset.inspect) return;
    if (tap.closest('.seat.selectable')) return;
    e.stopPropagation();
    e.preventDefault();
    inspectByEl(tap);
  }, true);

  // 移动端长按会弹出系统菜单
  document.addEventListener('contextmenu', e => {
    if (e.target.closest && e.target.closest('[data-inspect]')) e.preventDefault();
  });
}

function inspectByEl(el) {
  const spec = el.dataset.inspect || '';
  const i = spec.indexOf(':');
  if (i < 0) return;
  const kind = spec.slice(0, i);
  const arg = spec.slice(i + 1);
  if (kind === 'card') {
    const c = findCardByUid(+arg);
    if (c) openCardSheet(c);
  } else if (kind === 'general') {
    const p = G.players.find(x => x.seat === +arg);
    if (p) openGeneralSheet(p);
  } else if (kind === 'skill') {
    openSkillSheet(arg);
  } else if (kind === 'pile') {
    openPileSheet(arg);
  } else if (kind === 'equip') {
    openEquipSheet(arg);   // arg 是槽位名（weapon / armor / horsePlus / horseMinus）
  } else if (kind === 'identity') {
    openIdentitySheet(arg);   // arg 是座位号或 'mine'
  }
}

/* ================= 详情视图 ================= */

/* --- 卡牌详情 --- */
function openCardSheet(card, opts) {
  opts = opts || {};
  const info = CARD_INFO[card.id] || { name: card.name || '?' };
  const hasSuit = card.suit && card.suit !== 'none';
  const suitTxt = hasSuit ? `${SUIT_SYM[card.suit]}${numText(card.num)} · ` : '';
  const rangeTxt = info.range ? ` · 攻击范围 ${info.range}` : '';

  // 判定区里的延时锦囊：说明「挂在谁的判定区、什么时候结算」，
  // 并跳过「当前能不能使用」这种只对手牌有意义的状态块
  const judgeOf = (typeof G !== 'undefined' && G && G.players)
    ? G.players.find(p => p.judgeZone && p.judgeZone.some(j => j.uid === card.uid))
    : null;
  const judgeBlock = judgeOf
    ? `<div class="insp-state ok"><b>判定区 · ${judgeOf.name}</b>置于 ${judgeOf.name} 的判定区，在其回合开始时判定；结算后进入弃牌堆</div>`
    : '';
  const status = (opts.noStatus || judgeOf) ? '' : cardStatusBlock(card);
  const asInfo = (opts.asId && opts.asId !== card.id) ? CARD_INFO[opts.asId] : null;
  const asBlock = asInfo
    ? `<div class="insp-state ok"><b>视为【${asInfo.name}】</b>这张牌被当作【${asInfo.name}】使用／打出，按【${asInfo.name}】的规则结算</div>`
    : '';

  const html = `
    <div class="insp-hero">
      <div class="insp-cardbox" id="inspCardBox"></div>
      <div class="insp-heroinfo">
        <div class="insp-cname">${info.name}</div>
        <div class="insp-cmeta">${suitTxt}${cardTypeCn(card.id)}${rangeTxt}</div>
        <div class="insp-when">${cardUsage(card.id)}</div>
      </div>
    </div>
    <div class="insp-block">
      <div class="insp-ht">牌 面 效 果</div>
      <div class="insp-desc">${linkify(info.desc || '（此牌无额外说明）')}</div>
    </div>
    ${asBlock}
    ${judgeBlock}
    ${status}
    <div class="insp-hint">点按【】中的词条可查看对应牌牌面</div>`;

  SHEET.open(html, {
    title: asInfo ? `${info.name} → ${asInfo.name}` : info.name,
    sub: suitTxt + cardTypeCn(card.id) + rangeTxt,
    onMount: box => {
      const holder = box.querySelector('#inspCardBox');
      if (holder) {
        const c = cardEl(card, { cls: 'inspect' });
        c.style.transform = 'scale(1.75)';
        holder.appendChild(c);
      }
    },
  });
  if (opts.noBack !== true) { /* 保留在栈里，可返回 */ }
}

/* 一张牌同时指向多个目标时的目标列表（含在场武将详情） */
function openTargetsSheet(list) {
  list = list || [];
  const rows = list.map(t => `
    <div class="sk-row" data-inspect="general:${t.seat}">
      <div class="sk-line">
        <span class="sk-name">${t.name}</span>
        <span class="sk-tag ${t.kingdom || 'qun'}">${KINGDOM_CN[t.kingdom] || ''}</span>
        <span class="sk-own">${t.hp}/${t.maxHp} 血 · 手牌 ${t.hand ? t.hand.length : 0}</span>
      </div>
    </div>`).join('');
  SHEET.open(`
    <div class="insp-block"><div class="insp-ht">本 次 目 标</div>${rows}</div>
    <div class="insp-hint">点按武将名可查看其技能</div>`, {
    title: '目标',
    sub: `共 ${list.length} 名角色`,
  });
}

/* 当前这张牌「能不能用」的说明 */
function cardStatusBlock(card) {
  if (!UI.req) return '';
  let reason = '';
  if (UI.req.kind === 'play') {
    reason = cardPlayReason(card);
  } else if (UI.req.kind === 'respond') {
    reason = cardSelectable(card) ? '' : '当前不能作为响应牌打出';
  } else if (UI.req.kind === 'discard') {
    reason = cardSelectable(card) ? '' : '不在可弃置范围内';
  } else if (UI.req.kind === 'save') {
    reason = cardSelectable(card) ? '' : '当前不能使用';
  }
  let s = '';
  if (UI.req.kind === 'play') {
    s = reason
      ? `<div class="insp-state bad"><b>当前不可使用</b>${reason}</div>`
      : `<div class="insp-state ok"><b>可以使用</b>点此牌后选择目标</div>`;
  }
  return s;
}

/* --- 身份详情：谁公开了身份、各阵营怎么算赢、以及「我认为他是谁」的笔记 --- */
function openIdentitySheet(arg, opts) {
  opts = opts || {};
  const ps = (G && G.players) || [];
  const p = arg === 'mine' ? ps[0] : ps.find(x => x.seat === +arg);
  const isMe = arg === 'mine' || (p && p.seat === 0);
  const known = !!(p && (isMe || !p.alive || p.identity === 'lord'));
  const realKey = known ? p.identity : 'unknown';
  // 玩家自己记的猜测：只盖住问号，不改变「身份未明」这个事实
  const guessKey = (!known && p && G && G.guess) ? (G.guess[p.seat] || null) : null;
  const key = guessKey || realKey;
  const meta = IDENTITY_META[key] || IDENTITY_META.unknown;
  const who = p ? (isMe ? '你' : (p.general || '电脑 ' + p.seat)) : '你';
  let state;
  if (known) {
    state = `<div class="insp-state ok"><b>${isMe ? '你的目标' : '身份已公开'}</b>${meta.goal}${isMe ? '。达成条件即获胜。' : '。'}</div>`;
  } else if (guessKey) {
    state = `<div class="insp-state warn"><b>你标记为「${meta.cn}」（猜测）</b>这只是你自己的笔记，不影响结算；该角色阵亡后会亮出真实身份。</div>`;
  } else {
    state = '<div class="insp-state ok"><b>身份未明</b>除主公外，所有人的身份都保密，只有阵亡后才会亮出。可以从出牌对象来推测敌我。</div>';
  }
  const list = ['lord', 'loyal', 'rebel', 'spy'].map(k => {
    const m = IDENTITY_META[k];
    return `<div class="id-rule ${k === realKey ? 'cur' : ''}${k === guessKey ? ' mine' : ''}">${idBadge(k, { cls: 'sm' })}
      <span>${m.goal}<i>${m.note}</i></span></div>`;
  }).join('');
  // 猜不透就记下来：只对玩家自己可见，用来记住「3 号位像是反贼」
  const canGuess = p && !isMe && !known;
  const gbtn = k => {
    const on = guessKey === k;
    return `<button class="guess-btn${on ? ' on' : ''}" data-guess="${k}" aria-pressed="${on}">
      ${idBadge(k, { sealOnly: true, cls: 'xs' })}<b>${IDENTITY_META[k].cn}</b></button>`;
  };
  const guessBlock = canGuess ? `
    <div class="insp-block">
      <div class="insp-ht">我 的 标 记 · 帮 助 记 忆</div>
      <div class="guess-row">
        ${['lord', 'loyal', 'rebel', 'spy'].map(gbtn).join('')}
        <button class="guess-btn clr" data-guess=""><b>清除标记</b></button>
      </div>
      <div class="guess-note">点一下就记下你认为 ${who} 是什么身份，只有你看得到，不影响规则。</div>
    </div>` : '';
  const html = `
    <div class="id-head">${idBadge(key, { goal: true, guess: !!guessKey })}</div>
    ${state}
    ${guessBlock}
    <div class="insp-block"><div class="insp-ht">四 种 身 份 与 胜 利 条 件</div>${list}</div>
    <div class="insp-hint">${who} · ${meta.note}　主公身份始终公开；其余身份阵亡后才会亮出</div>`;
  const sheetOpts = {
    title: '身份与胜利条件', sub: meta.cn,
    onMount: box => {
      box.querySelectorAll('.guess-btn').forEach(btn => {
        btn.onclick = () => {
          const v = btn.dataset.guess;
          if (v) G.guess[p.seat] = v; else delete G.guess[p.seat];
          UI.render();
          openIdentitySheet(arg, { replace: true });
        };
      });
    },
  };
  if (opts.replace) SHEET.replace(html, sheetOpts);
  else SHEET.open(html, sheetOpts);
}

/* --- 武将详情 --- */
function openGeneralSheet(p) {
  const isMe = p.seat === 0;
  const g = GENERAL_MAP[p.generalId];
  const skills = p.skills.map(sid => {
    const sk = SKILLS[sid];
    if (!sk) return '';
    const ty = skillType(sk);
    return `
      <div class="sk-row" data-inspect="skill:${sid}">
        <div class="sk-line">
          <span class="sk-name">${sk.name}</span>
          <span class="sk-tag ${ty.cls}">${ty.txt}</span>
        </div>
        <div class="sk-desc">${linkify(sk.desc || '')}</div>
      </div>`;
  }).join('');

  const equips = ['weapon', 'armor', 'horsePlus', 'horseMinus']
    .map(k => p.equip[k]).filter(Boolean)
    .map(c => `<div class="sk-row" data-inspect="card:${c.uid}">
        <div class="sk-line"><span class="sk-name">${c.name}</span>
        <span class="sk-tag eq">装备</span></div>
        <div class="sk-desc">${linkify(CARD_INFO[c.id] ? CARD_INFO[c.id].desc : '')}</div>
      </div>`).join('');

  const judges = p.judgeZone.map(c => `<div class="sk-row" data-inspect="card:${c.uid}">
      <div class="sk-line"><span class="sk-name">${c.name}</span>
      <span class="sk-tag judge">判定区</span></div>
      <div class="sk-desc">${linkify(CARD_INFO[c.id] ? CARD_INFO[c.id].desc : '')}</div>
    </div>`).join('');

  // 主公身份公开、阵亡后公开；其他人一律显示「身份未明」，但玩家自己的标记要露出来
  const idKnown = isMe || !p.alive || p.identity === 'lord';
  const myGuess = (!idKnown && G && G.guess) ? (G.guess[p.seat] || null) : null;
  const idKey = idKnown ? p.identity : (myGuess || 'unknown');
  const idTag = idBadge(idKey, { cls: 'sm', guess: !!myGuess, inspect: 'identity:' + (isMe ? 'mine' : p.seat) });
  const idGoal = myGuess
    ? `<div class="insp-idgoal warn">你的标记：${IDENTITY_META[myGuess].cn}（猜测，真实身份未明）</div>`
    : `<div class="insp-idgoal">${IDENTITY_META[idKey].goal}</div>`;
  const hp = hpDots(p.hp, Math.max(p.maxHp, p.hp), false);

  const html = `
    <div class="insp-hero gen-hero">
      <div class="gen-avatar ${p.kingdom || 'qun'}">
        <div class="gen-kg">${KINGDOM_CN[p.kingdom] || '?'}</div>
        <div class="gen-nm">${p.general || '???'}</div>
      </div>
      <div class="insp-heroinfo">
        <div class="insp-cname">${p.general || '???'} ${idTag}</div>
        <div class="insp-cmeta">${isMe ? '你的武将牌' : '电脑 ' + p.seat} · ${KINGDOM_CN[p.kingdom] || ''}</div>
        ${idGoal}
        <div class="insp-hp">${hp}</div>
        ${p.alive ? `<div class="insp-chain">${p.flags.chained
          ? '<b class="on">横置中</b> 受到【火】【雷】属性伤害会传导给其他横置角色，随后重置'
          : '<b class="off">重置</b> 未横置，铁索不传导'}</div>` : ''}
      </div>
    </div>
    ${!isMe && p.alive ? `<div class="insp-state ok"><b>当前状况</b>手牌 ${p.hand.length} 张 · 体力 ${p.hp}/${p.maxHp} · 装备 ${['weapon','armor','horsePlus','horseMinus'].filter(k=>p.equip[k]).length} 件</div>` : ''}
    ${skills ? `<div class="insp-block"><div class="insp-ht">武 将 技 能</div>${skills}</div>` : ''}
    ${equips ? `<div class="insp-block"><div class="insp-ht">装 备 区</div>${equips}</div>` : '<div class="insp-block"><div class="insp-ht">装 备 区</div><div class="insp-hint" style="text-align:left;padding:2px 0 0">没有装备任何牌</div></div>'}
    ${judges ? `<div class="insp-block"><div class="insp-ht">判 定 区</div>${judges}</div>` : ''}
    ${!p.alive ? '<div class="insp-state bad">该角色已阵亡</div>' : ''}
    <div class="insp-hint">点按技能名可查看完整说明</div>`;

  SHEET.open(html, {
    title: p.general || '武将',
    sub: (isMe ? '你的武将牌' : '电脑 ' + p.seat) + ' · ' + (KINGDOM_CN[p.kingdom] || ''),
  });
}

/* --- 技能详情 --- */
function openSkillSheet(sid) {
  const sk = SKILLS[sid];
  if (!sk) return;
  const ty = skillType(sk);
  const owners = SKILL_OWNERS[sid] || [];
  const gset = GENERALS.filter(g => g.skills.indexOf(sid) >= 0);

  const ownerRows = gset.map(g => `
    <div class="sk-row" data-inspect="general:${g.id}">
      <div class="sk-line">
        <span class="sk-name">${g.name}</span>
        <span class="sk-tag ${g.kingdom}">${KINGDOM_CN[g.kingdom]}</span>
        <span class="sk-own">${g.skills.map(s => SKILLS[s] ? SKILLS[s].name : s).join(' · ')}</span>
      </div>
    </div>`).join('');

  const mine = G.players[0] && G.players[0].skills.indexOf(sid) >= 0;
  const myState = mine ? `
    <div class="insp-state ${activeAvailable(G.players[0], sid) ? 'ok' : ''}">
      <b>${activeAvailable(G.players[0], sid) ? '当前可以发动' : '当前无法发动'}</b>
      ${activeAvailable(G.players[0], sid) ? '出牌阶段点击技能按钮发动' : '未满足发动条件，或本局已使用过'}
    </div>` : '';

  const html = `
    <div class="skill-hero">
      <div class="sk-big">${sk.name}</div>
      <span class="sk-tag ${ty.cls}">${ty.txt}</span>
    </div>
    <div class="insp-block">
      <div class="insp-ht">技 能 描 述</div>
      <div class="insp-desc big">${linkify(sk.desc || '')}</div>
    </div>
    ${myState}
    ${ownerRows ? `<div class="insp-block"><div class="insp-ht">拥 有 者</div>${ownerRows}</div>` : ''}
    <div class="insp-hint">${owners.length ? '拥有武将：' + owners.join('、') : ''}</div>`;

  SHEET.open(html, { title: sk.name, sub: ty.txt });
}

/* --- 牌堆详情 --- */
function openPileSheet(kind) {
  let title = '', sub = '', html = '';
  if (kind === 'draw') {
    title = '牌 堆';
    sub = `剩余 ${G.deck.length} 张`;
    html = `<div class="insp-desc big">牌堆内容不可见。回合开始时从这里摸牌，判定时从这里翻牌。</div>`;
  } else {
    const list = G.discard.slice().reverse();
    title = '弃 牌 堆';
    sub = `共 ${list.length} 张`;
    const rows = list.map(c => {
      const i = CARD_INFO[c.id] || {};
      return `<div class="pile-row" data-inspect="card:${c.uid}">
        <span class="pr-suit ${isRed(c) ? 'red' : 'blk'}">${SUIT_SYM[c.suit] || ''}${c.num ? numText(c.num) : ''}</span>
        <span class="pr-name">${i.name || c.name}</span>
        <span class="pr-type">${cardTypeCn(c.id)}</span>
      </div>`;
    }).join('');
    html = list.length ? rows : '<div class="insp-desc big">还没有弃置过牌。</div>';
  }
  SHEET.open(html, { title: title, sub: sub });
}

/* --- 装备区详情（点击装备槽） --- */
function openEquipSheet(slot) {
  const me = G.players[0];
  if (!me) return;
  const c = me.equip[slot];
  if (!c) {
    const names = { weapon: '武器区', armor: '防具区', horsePlus: '+1 坐骑区', horseMinus: '-1 坐骑区' };
    SHEET.open(`<div class="insp-desc big">${names[slot] || '装备区'}　当前为空</div>`, { title: names[slot] || '装备区', sub: '空' });
    return;
  }
  openCardSheet(c);
}

/* ================= 图鉴 Codex ================= */

const CODEX_TABS = [
  { id: 'cards', name: '卡 牌' },
  { id: 'skills', name: '技 能' },
  { id: 'rules', name: '规 则' },
];

function openCodex(tab) {
  tab = tab || 'cards';
  const html = `
    <div class="codex-tabs">
      ${CODEX_TABS.map(t => `<button class="cx-tab ${t.id === tab ? 'on' : ''}" data-cx="${t.id}">${t.name}</button>`).join('')}
    </div>
    <div class="codex-search"><input id="cxSearch" type="search" placeholder="搜索名称或说明…" autocomplete="off"></div>
    <div id="codexBody" class="codex-body"></div>`;

  SHEET.open(html, {
    title: '图 鉴',
    sub: '卡牌 / 技能 / 规则速查',
    onMount: box => {
      const body = box.querySelector('#codexBody');
      const input = box.querySelector('#cxSearch');
      const paint = () => {
        const q = (input.value || '').trim().toLowerCase();
        body.innerHTML = codexContent(tab, q);
      };
      paint();
      input.addEventListener('input', paint);
      box.querySelectorAll('.cx-tab').forEach(b => {
        b.onclick = () => openCodex(b.dataset.cx);
      });
    },
  });
}

function codexContent(tab, q) {
  if (tab === 'cards') return codexCards(q);
  if (tab === 'skills') return codexSkills(q);
  return codexRules();
}

function codexCards(q) {
  const groups = [
    { key: 'basic', name: '基 本 牌', ids: ['sha', 'huosha', 'leisha', 'shan', 'tao', 'jiu'] },
    { key: 'trick', name: '锦 囊 牌', ids: ['juedou', 'guohe', 'shunshou', 'wuzhong', 'jiedao', 'nanman', 'wanjian', 'taoyuan', 'wugu', 'wuxie', 'huogong', 'tiesuo'] },
    { key: 'delay', name: '延时锦囊', ids: ['lebu', 'shandian', 'bingliang'] },
    { key: 'weapon', name: '武 器', ids: ['zhuge', 'qinggang', 'cixiong', 'qinglong', 'zhangba', 'guanshi', 'fangtian', 'qilin', 'guding', 'zhuque'] },
    { key: 'armor', name: '防 具', ids: ['bagua', 'renwang', 'tengjia', 'baiyin'] },
    { key: 'horse', name: '坐 骑', ids: ['chitu', 'dawan', 'zixing', 'dilu', 'jueying', 'zhuahuang', 'hualiu'] },
  ];
  let out = '';
  for (const g of groups) {
    const ids = g.ids.filter(id => {
      if (!q) return true;
      const i = CARD_INFO[id];
      return (i.name + ' ' + (i.desc || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (!ids.length) continue;
    out += `<div class="cx-group"><div class="cx-gname">${g.name}</div>`;
    for (const id of ids) {
      const i = CARD_INFO[id];
      out += `<div class="cx-row" data-inspect="card:${id}">
        <div class="cx-rname">${i.name}${i.range ? `<span class="cx-badge">范围${i.range}</span>` : ''}</div>
        <div class="cx-rdesc">${linkify(i.desc || '')}</div>
      </div>`;
    }
    out += '</div>';
  }
  return out || '<div class="cx-empty">没有匹配的牌</div>';
}

function codexSkills(q) {
  const ids = Object.keys(SKILLS).filter(sid => {
    if (!q) return true;
    const sk = SKILLS[sid];
    const owners = (SKILL_OWNERS[sid] || []).join(' ');
    return ((sk.name || '') + ' ' + (sk.desc || '') + ' ' + owners).toLowerCase().indexOf(q) >= 0;
  });
  if (!ids.length) return '<div class="cx-empty">没有匹配的技能</div>';
  return ids.map(sid => {
    const sk = SKILLS[sid];
    const ty = skillType(sk);
    const owners = (SKILL_OWNERS[sid] || []).join('、');
    return `<div class="cx-row sk" data-inspect="skill:${sid}">
      <div class="cx-rname">${sk.name}<span class="sk-tag ${ty.cls}">${ty.txt}</span>
        ${owners ? `<span class="cx-owners">${owners}</span>` : ''}</div>
      <div class="cx-rdesc">${linkify(sk.desc || '')}</div>
    </div>`;
  }).join('');
}

function codexRules() {
  return `
  <div class="rule-sec">
    <h4>一 · 身份与胜利条件</h4>
    <div class="rule-row"><span class="rk-id">${idBadge('lord', { cls: 'sm' })}</span><span>存活到最后。需击败所有反贼与内奸。体力上限 +1，身份始终公开。</span></div>
    <div class="rule-row"><span class="rk-id">${idBadge('loyal', { cls: 'sm' })}</span><span>与主公胜利条件相同，身份对所有人隐藏。</span></div>
    <div class="rule-row"><span class="rk-id">${idBadge('rebel', { cls: 'sm' })}</span><span>击杀主公即获胜，即使内奸仍存活。</span></div>
    <div class="rule-row"><span class="rk-id">${idBadge('spy', { cls: 'sm' })}</span><span>先助主公消灭全部反贼，最后与主公单挑获胜。</span></div>
  </div>

  <div class="rule-sec">
    <h4>二 · 回合流程</h4>
    <ol class="rule-ol">
      <li><b>准备阶段</b>　触发回合开始技能，如观星、洛神</li>
      <li><b>判定阶段</b>　依次结算判定区的延时锦囊（乐不思蜀 / 兵粮寸断 / 闪电）</li>
      <li><b>摸牌阶段</b>　摸两张牌</li>
      <li><b>出牌阶段</b>　使用手牌与技能，【杀】默认限用一次</li>
      <li><b>弃牌阶段</b>　手牌上限＝当前体力，弃置多余手牌</li>
      <li><b>结束阶段</b>　弃置手牌，回合结束</li>
    </ol>
  </div>

  <div class="rule-sec">
    <h4>三 · 伤害与濒死</h4>
    <p>【杀】结算：目标需打出【闪】抵消；否则受到 1 点伤害。本回合使用【酒】后伤害 +1。</p>
    <p>濒死：体力降至 0 时进入濒死状态，需由自己或他人打出【桃】回复 1 点体力；无人救援则该角色阵亡。</p>
    <p>【闪】【桃】【酒】属于「响应牌」：在需要时从手牌中打出，不占用出牌次数。</p>
  </div>

  <div class="rule-sec">
    <h4>四 · 距离与攻击范围</h4>
    <p>角色按顺时针围坐，相邻两名角色距离为 1。你的攻击范围默认为 <b>1</b>，武器可提升：</p>
    <p class="rule-mini">诸葛连弩 1　青釭剑 2　雌雄双股剑 2　青龙偃月刀 3　丈八蛇矛 3　贯石斧 3　方天画戟 4　麒麟弓 4　朱雀羽扇 4</p>
    <p>装备 <b>-1 马</b>（赤兔 / 大宛 / 紫骍）使<b>你</b>计算的距离 −1；装备 <b>+1 马</b>（的卢 / 绝影 / 爪黄飞电 / 骅骝）使<b>别人</b>计算与你的距离 +1。</p>
  </div>

  <div class="rule-sec">
    <h4>五 · 关键词</h4>
    <div class="rule-row"><b class="rk">锁定技</b><span>满足条件时必然发动，无法选择放弃。</span></div>
    <div class="rule-row"><b class="rk">限定技</b><span>每局游戏只能发动一次。</span></div>
    <div class="rule-row"><b class="rk">主公技</b><span>仅主公拥有并生效。</span></div>
    <div class="rule-row"><b class="rk">转化技</b><span>可将指定牌当作另一张牌使用或打出，如武圣、龙胆。</span></div>
    <div class="rule-row"><b class="rk">判定</b><span>从牌堆翻开一张牌，按其花色或点数决定结果，结算后进入弃牌堆。</span></div>
    <div class="rule-row"><b class="rk">响应</b><span>当你需要使用或打出一张牌时，从手牌中选择一张打出。</span></div>
  </div>

  <div class="rule-sec">
    <h4>六 · 手机操作</h4>
    <div class="rule-row"><b class="rk">点按</b><span>选择手牌 / 选择目标；点按行动横幅里的牌、武将名、目标名可看详情</span></div>
    <div class="rule-row"><b class="rk">长按</b><span>查看牌面效果、武将技能、牌堆内容</span></div>
    <div class="rule-row"><b class="rk">战报</b><span>回看时点武将名或【牌名】即可打开详情</span></div>
    <div class="rule-row"><b class="rk">ⓘ</b><span>就地查看当前上下文的说明</span></div>
    <div class="rule-row"><b class="rk">图鉴</b><span>右上角「册」按钮，翻阅全部卡牌与技能</span></div>
  </div>`;
}

/* ================= 新手引导 ================= */

const COACH = {
  seen: {},
  show(key, text, anchor) {
    if (this.seen[key]) return;
    this.seen[key] = true;
    const box = document.getElementById('coach');
    if (!box) return;
    box.innerHTML = `<div class="coach-in"><span class="coach-txt">${text}</span><span class="coach-x">知道了</span></div>`;
    box.classList.remove('hidden');
    const close = () => { box.classList.add('hidden'); };
    box.onclick = close;
    clearTimeout(this._t);
    this._t = setTimeout(close, 5200);
  },
  hide() {
    const box = document.getElementById('coach');
    if (box) box.classList.add('hidden');
    clearTimeout(this._t);
  },
  reset() { this.seen = {}; },
};

function coachTick() {
  const req = UI.req;
  if (!G || !G.players.length) return;
  if (req) {
    if (req.kind === 'play') COACH.show('play', '出牌阶段：点按手牌选择要用的牌 → 点按目标 → 点【使用】');
    else if (req.kind === 'respond') COACH.show('respond', '轮到你响应：点按手牌中的对应牌（如【闪】）打出，或点【取消】放弃');
    else if (req.kind === 'discard') COACH.show('discard', '手牌上限＝当前体力，请点选手牌弃置多余的部分');
    else if (req.kind === 'save') COACH.show('save', '有角色濒死！打出【桃】可以救回 1 点体力；自己濒死时【酒】也能自救');
    else if (req.kind === 'wuxie') COACH.show('wuxie', '可以用【无懈可击】抵消对方的锦囊');
  } else if (G.phase === 'play' && G.players[G.current] && G.players[G.current].seat === 0) {
    COACH.show('play', '出牌阶段：点按手牌选择要用的牌 → 点按目标 → 点【使用】');
  }
}

/* ================= 初始化 ================= */

function initInspect() {
  const s = document.getElementById('sheet');
  if (!s) return;
  // sheetHead 每次绘制都会被重建，这里用事件委托而不是直接绑定 onclick
  const head = document.getElementById('sheetHead');
  head.addEventListener('click', e => {
    if (e.target.closest('.sheet-close')) { sheetClose(); return; }
    if (e.target.closest('.sheet-back')) { SHEET.back(); }
  });
  s.querySelector('#sheetScrim').onclick = sheetClose;
  const pend = document.getElementById('sheetPending');
  if (pend) pend.onclick = sheetClose;

  // 抽屉内的可点元素
  s.addEventListener('click', e => {
    const kw = e.target.closest('.kw');
    if (kw) {
      e.stopPropagation();
      const id = kw.dataset.kw;
      openCardSheet({ id: id, suit: 'none', num: 0, uid: -1 });
      return;
    }
    const row = e.target.closest('[data-inspect]');
    if (row) {
      const spec = row.dataset.inspect;
      const i = spec.indexOf(':');
      const kind = spec.slice(0, i), arg = spec.slice(i + 1);
      if (kind === 'skill') { openSkillSheet(arg); return; }
      if (kind === 'identity') { openIdentitySheet(arg); return; }
      if (kind === 'general') {
        const p = G.players.find(x => x.seat === +arg);
        if (p) { openGeneralSheet(p); return; }
        if (GENERAL_MAP[arg]) {
          const g = GENERAL_MAP[arg];
          const q = G.players.find(x => x.generalId === arg);
          if (q) openGeneralSheet(q); else openGeneralById(g);
        }
        return;
      }
      if (kind === 'card') {
        const c = findCardByUid(+arg);
        if (c) openCardSheet(c);
        else {
          const id = arg;
          if (CARD_INFO[id]) openCardSheet({ id: id, suit: 'none', num: 0, uid: -1 });
        }
        return;
      }
    }
  });

  // 行动横幅：牌 / 名字 / 目标都可点
  const bn = document.getElementById('banner');
  if (bn) bn.addEventListener('click', bannerTap);

  // 中央结算区的牌：点开看详情（AI 打出的牌不用等横幅）
  const pslot = document.getElementById('processSlot');
  if (pslot) {
    pslot.addEventListener('click', () => {
      if (G && G.processing) openCardSheet(G.processing, { noStatus: true });
    });
  }

  // 中央回合名：点开当前行动者的武将详情
  const tn = document.getElementById('turnName');
  if (tn) {
    tn.addEventListener('click', () => {
      const p = G && G.players[G.current];
      if (p) openGeneralSheet(p);
    });
  }

  // 战报：牌名 / 武将名可点
  const ll = document.getElementById('logList');
  if (ll) ll.addEventListener('click', logTap);

  initInspectGesture();
}

/* 图鉴里点武将（可能未在场） */
function openGeneralById(g) {
  const skills = g.skills.map(sid => {
    const sk = SKILLS[sid]; if (!sk) return '';
    const ty = skillType(sk);
    return `<div class="sk-row" data-inspect="skill:${sid}">
      <div class="sk-line"><span class="sk-name">${sk.name}</span><span class="sk-tag ${ty.cls}">${ty.txt}</span></div>
      <div class="sk-desc">${linkify(sk.desc || '')}</div></div>`;
  }).join('');
  SHEET.open(`
    <div class="insp-hero gen-hero">
      <div class="gen-avatar ${g.kingdom}">
        <div class="gen-kg">${KINGDOM_CN[g.kingdom] || '?'}</div>
        <div class="gen-nm">${g.name}</div>
      </div>
      <div class="insp-heroinfo">
        <div class="insp-cname">${g.name}</div>
        <div class="insp-cmeta">${KINGDOM_CN[g.kingdom] || ''} · 体力上限 ${g.hp}</div>
        <div class="insp-hp">${hpDots(g.hp, g.hp, false)}</div>
      </div>
    </div>
    ${g.quote ? `<div class="insp-quote">「${g.quote}」</div>` : ''}
    <div class="insp-block"><div class="insp-ht">武 将 技 能</div>${skills}</div>`, {
    title: g.name, sub: KINGDOM_CN[g.kingdom] || '',
  });
}

/* 抽屉打开时若玩家有待处理操作，给出返回提示 */
function setPending(on) {
  const el = document.getElementById('sheetPending');
  if (!el) return;
  el.classList.toggle('hidden', !on);
}

/* 暴露到全局 */
window.INSPECT = {
  SHEET, COACH, openCardSheet, openGeneralSheet, openSkillSheet, openPileSheet, openCodex,
  openTargetsSheet, logHtml, bannerTap, logTap,
  cardPlayReason, linkify, cardUsage, skillType, setPending, coachTick,
};
