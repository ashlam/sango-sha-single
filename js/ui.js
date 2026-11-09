'use strict';
/* ============================================================
 *  三国杀 · 单机版   —— 界面与交互
 * ============================================================ */

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const UI = {
  req: null,
  player: null,
  resolve: null,
  sel: { cards: [], targets: [], asId: null, zb: false },
  lastHandKey: '',
  seatEls: {},
  idMarkEls: {},
  modalResolve: null,
  logOpen: false,
  resultMini: false,
  resultHtml: '',
};

// 暴露给引擎（跨 script 的 const 不会自动挂到 window）
window.UI = UI;


/* ================= 通用 DOM ================= */

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function cardEl(card, opts) {
  opts = opts || {};
  const info = CARD_INFO[card.id] || { type: 'basic' };
  const red = isRed(card);
  const el = h('div', 'card' + (info.type === 'equip' ? ' equip' : '') + (opts.cls ? ' ' + opts.cls : ''));
  el.dataset.uid = card.uid;
  const nm = card.name || info.name;
  const nameCls = nm.length <= 2 ? '' : nm.length === 3 ? 'two' : nm.length === 4 ? 'four' : 'five';
  const nmHtml = nm.length <= 3 ? nm
    : nm.length === 4 ? nm.slice(0, 2) + '<br>' + nm.slice(2)
    : nm.slice(0, 3) + '<br>' + nm.slice(3);
  const typeCn = info.type === 'basic' ? '基本' : info.type === 'trick' ? (info.delay ? '延时锦囊' : '锦囊') : '装备';
  el.innerHTML = `
    <div class="c-corner">
      <span class="c-suit ${red ? 'red' : 'blk'}">${SUIT_SYM[card.suit] || ''}</span>
      <span class="c-num">${card.num ? numText(card.num) : ''}</span>
    </div>
    ${info.type === 'equip' && info.range ? `<div class="c-badge">${info.range}</div>` : ''}
    <div class="c-name ${nameCls}">${nmHtml}</div>
    <div class="c-type">${typeCn}</div>
  `;
  return el;
}

function hpDots(cur, max, thunder) {
  let s = '';
  for (let i = 0; i < max; i++) s += `<i class="dot ${i < cur ? '' : 'e'}"></i>`;
  return s;
}

/* ================= 渲染 ================= */

UI.render = function () {
  if (!G.players.length) return;
  renderSeats();
  renderSelf();
  renderHand();
  renderActionBar();
  renderProcess();
  // 横屏的牌桌中心放不下回合名（会在座位卡与动作横幅之间被挤死），
  // 挂到 HUD 的回合胶囊里：「第 3 回合 · 司马懿」
  const who = window.innerWidth > window.innerHeight ? G.players[G.current] : null;
  $('#hudTurn').textContent = `第 ${G.turn} 回合`
    + (who && who.alive ? ' · ' + who.name : '');
  $('#hudDeck').textContent = `牌堆 ${G.deck.length}`;
  const pd = $('#pileDraw'), pdc = $('#pileDiscard');
  if (pd) pd.querySelector('.pile-n').textContent = G.deck.length;
  if (pdc) pdc.querySelector('.pile-n').textContent = G.discard.length;
  const me = G.players[0];
  const hi = $('#hudIdentity');
  if (hi) hi.innerHTML = me ? idBadge(me.identity, { cls: 'hud', inspect: 'identity:mine' }) : '';

  // 信息层：引导提示 + 抽屉上的待办标记
  if (window.INSPECT) {
    INSPECT.setPending(!!UI.req);
    INSPECT.coachTick();
  }
  refreshPendingUI();
};

/* 座位沿椭圆弧分布，环绕中央牌桌。参数 n = 对手人数（不含自己） */
const SEAT_POS = {
  1: [[50, 34]],
  2: [[26, 38], [74, 38]],
  3: [[22, 40], [50, 18], [78, 40]],
  4: [[18, 40], [38, 18], [62, 18], [82, 40]],
  5: [[11, 45], [26, 30], [50, 19], [74, 30], [89, 45]],
  6: [[10, 46], [19, 30], [37, 19], [63, 19], [81, 30], [90, 46]],
  7: [[10, 46], [18, 33], [30, 20], [50, 20], [70, 20], [82, 33], [90, 46]],
};
/* 横屏手机：一行排开，避免顶部被裁 */
/* 横屏手机（矮屏）：一行排开，但整体上移让出牌桌中心。
 * y 原来和动作横幅一样是 40%，中间那张卡被横幅整块盖住（实测重叠 6600px²）；
 * 现在座位吃 20%（紧贴 HUD 下方），中心区/横幅/牌堆都在它下面 */
const SEAT_POS_LAND = {
  1: [[50, 24]],
  2: [[28, 24], [72, 24]],
  3: [[20, 24], [50, 24], [80, 24]],
  4: [[15, 24], [38, 24], [62, 24], [85, 24]],
  5: [[10, 24], [30, 24], [50, 24], [70, 24], [90, 24]],
  6: [[8, 24], [25, 24], [42, 24], [58, 24], [75, 24], [92, 24]],
  7: [[7, 24], [21, 24], [36, 24], [50, 24], [64, 24], [79, 24], [93, 24]],
};
/* 横屏平板：沿弧形铺开，中间高、两侧低，像围着牌桌坐一圈。
 * 弧顶（中间那位）必须留在动作横幅上方，所以整体比牌桌中心线高一档 */
const SEAT_POS_LAND_PAD = {
  1: [[50, 34]],
  2: [[30, 36], [70, 36]],
  3: [[21, 39], [50, 24], [79, 39]],
  4: [[14, 42], [38, 27], [62, 27], [86, 42]],
  5: [[10, 44], [30, 30], [50, 23], [70, 30], [90, 44]],
  6: [[8, 46], [25, 31], [41, 25], [59, 25], [75, 31], [92, 46]],
  7: [[7, 47], [22, 32], [36, 26], [50, 23], [64, 26], [78, 32], [93, 47]],
};

/* 三档设备：横屏手机（矮）/ 横屏平板 / 竖屏平板。
   与 css 里的媒体查询一一对应，改档位时两边要一起改。 */
function isLandscapePhone() {
  return window.innerWidth > window.innerHeight && window.innerHeight <= 520;
}
function isLandscapePad() {
  return window.innerWidth > window.innerHeight && window.innerHeight > 520;
}
function isPortraitPad() {
  return window.innerWidth <= window.innerHeight && window.innerWidth >= 600;
}
function viewTier() {
  if (isLandscapePhone()) return 'phone-land';
  if (isLandscapePad()) return 'pad-land';
  if (isPortraitPad()) return 'pad-port';
  return 'phone-port';
}
function seatPositions(n) {
  if (isLandscapePhone()) {
    const pos = SEAT_POS_LAND[n] || SEAT_POS_LAND[5];
    // 纵向位置允许 CSS 用 --seat-y 分档微调（矮屏舞台只有一百多像素，
    // 24% 和 30% 差的就是「卡顶钻不钻进 HUD」），见 css 末尾的横屏分区
    const ty = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--seat-y'));
    return isNaN(ty) ? pos : pos.map(([x]) => [x, ty]);
  }
  if (isLandscapePad()) return SEAT_POS_LAND_PAD[n] || SEAT_POS_LAND_PAD[5];
  return SEAT_POS[n] || SEAT_POS[5];
}

function renderSeats() {
  const wrap = $('#seats');
  const others = G.players.filter(p => p.seat !== 0);
  const n = others.length;
  const pos = seatPositions(n);
  wrap.classList.toggle('dense', n >= 4);
  wrap.classList.toggle('tight', n >= 5 && n < 7);
  wrap.classList.toggle('ultra', n === 7);

  others.forEach((p, i) => {
    let el = UI.seatEls[p.seat];
    if (!el) {
      el = h('div', 'seat');
      el.dataset.seat = p.seat;
      el.innerHTML = `<div class="bubble"></div><div class="judge-tags"></div><div class="gcard"></div><div class="hand-count">0</div><div class="dist-tag" style="display:none"></div>`;
      wrap.appendChild(el);
      UI.seatEls[p.seat] = el;
    }
    el.dataset.inspect = 'general:' + p.seat;
    const pt = pos[i % pos.length];
    el.style.left = pt[0] + '%';
    el.style.top = pt[1] + '%';

    const gc = el.querySelector('.gcard');
    gc.className = 'gcard ' + (p.kingdom || 'qun') + (p.identity === 'lord' ? ' is-lord' : '');
    const skills = p.skills.map(s => SKILLS[s] ? SKILLS[s].name : '').filter(Boolean).join(' · ');
    const equipTxt = ['weapon', 'armor', 'horsePlus', 'horseMinus']
      .map(k => p.equip[k] ? p.equip[k].name : null).filter(Boolean);
    gc.innerHTML = `
      <div class="gc-top">
        <span class="gc-kingdom">${KINGDOM_CN[p.kingdom] || '?'}</span>
        <span class="gc-name">${p.general || '???'}</span>
      </div>
      <div class="gc-hp">${hpDots(p.hp, Math.max(p.maxHp, p.hp), false)}${p.flags.chained ? '<span class="gc-chain">链</span>' : ''}</div>
      <div class="gc-bottom">
        <span class="gc-skill">${skills}</span>
        <button class="gc-info" data-seat="${p.seat}">ⓘ</button>
      </div>
      ${equipTxt.length ? `<div class="gc-skill" style="color:#c8a95c;margin-top:2px">${equipTxt.join(' ')}</div>` : ''}
      ${p.flipped ? `<div class="gc-skill" style="color:#e0604e">翻面</div>` : ''}
    `;

    el.querySelector('.hand-count').textContent = p.hand.length;

    // 判定区
    const jt = el.querySelector('.judge-tags');
    jt.innerHTML = p.judgeZone.map(c =>
      `<div class="jtag ${c.id === 'shandian' ? 'shandian' : c.id === 'bingliang' ? 'bingliang' : ''}" data-inspect="card:${c.uid}" data-tap="1" title="判定区 · ${c.name}（点按看效果）">${c.name[0]}</div>`
    ).join('');

    el.classList.toggle('dead', !p.alive);
    el.classList.toggle('active-turn', G.players[G.current] === p);
    el.classList.toggle('dying', !!p.dying);

    // 可选目标
    const selectable = UI.sel.cards.length > 0 && canTargetSeat(p) || (UI.req && UI.req.kind === 'target' && isCandidate(p));
    el.classList.toggle('selectable', !!selectable);
    el.classList.toggle('chosen', UI.sel.targets.includes(p));

    // 距离徽章：选牌后显示到各目标的距离，不可选时标红
    const dt = el.querySelector('.dist-tag');
    if (dt) {
      let txt = '', bad = false, show = false;
      if (UI.sel.cards.length === 1 && UI.req && UI.req.kind === 'play') {
        const card = UI.sel.cards[0];
        const asId = UI.sel.asId || card.id;
        const tc = targetCountRange(G.players[0], asId, card);
        if (!tc.auto && tc.min > 0) {
          const ti = targetInfo(p, asId, card);
          show = true; bad = !ti.ok;
          txt = '距 ' + ti.dist + (ti.ok ? '' : ' ✕');
        }
      }
      if (show) { dt.textContent = txt; dt.className = 'dist-tag' + (bad ? ' bad' : ''); dt.style.display = ''; }
      else dt.style.display = 'none';
    }
  });

  // 身份印章不放在 .seat 内：每个座位是独立层叠上下文，密集排布时印章会被
  // 相邻武将卡盖住。统一挂到 #seats 这一层（z=30 > 座位 z=5），按卡片实测坐标定位。
  const used = new Set(others.map(p => p.seat));
  Object.keys(UI.idMarkEls).forEach(s => {
    if (!used.has(+s)) { UI.idMarkEls[s].remove(); delete UI.idMarkEls[s]; }
  });
  others.forEach(p => {
    let mk = UI.idMarkEls[p.seat];
    if (!mk) {
      mk = h('div', 'id-mark');
      mk.dataset.seat = p.seat;
      wrap.appendChild(mk);
      UI.idMarkEls[p.seat] = mk;
    }
    // 主公与已阵亡者身份公开，其余一律灰色「?」——「身份未明」本身也是要明确表达的信息。
    // 玩家自己做的身份标记（G.guess）会盖住问号，但带一个「?」小角标，表示这是猜测
    const idKnown = p.identity === 'lord' || !p.alive;
    const guessed = idKnown ? null : ((G.guess && G.guess[p.seat]) || null);
    mk.innerHTML = idBadge(idKnown ? p.identity : (guessed || 'unknown'), {
      sealOnly: true, cls: 'xs', guess: !!guessed, inspect: 'identity:' + p.seat,
    });
  });
  layoutIdMarks();
  scheduleIdLayout();
  // 引导条出现/消失会改变 #seats 高度，卡片跟着动 —— 尺寸一变就重摆印章
  if (!_idRO && typeof ResizeObserver !== 'undefined') {
    _idRO = new ResizeObserver(() => layoutIdMarks());
    _idRO.observe(wrap);
  }
}

/* 首次渲染后 HUD / 引导条还会陆续排完版，卡片位置会跳几次；补几拍重摆印章 */
let _idRO = null;
let _idTick = [];
function scheduleIdLayout() {
  requestAnimationFrame(layoutIdMarks);
  _idTick.forEach(clearTimeout);
  _idTick = [90, 300, 700].map(ms => setTimeout(layoutIdMarks, ms));
}

/* 把身份印章摆到各自武将卡上方（撞到引导条或极窄屏时改挂下方） */
function layoutIdMarks() {
  const wrap = $('#seats');
  if (!wrap) return;
  const wr = wrap.getBoundingClientRect();
  const below = window.innerWidth <= 360;  // 极窄屏顶排贴着引导条，改挂卡片下方
  // 新手引导条是 fixed 层（z=92），盖在 #seats 之上：撞上时把该印章挪到卡片下方
  const coach = document.getElementById('coach');
  const cr = (coach && !coach.classList.contains('hidden')) ? coach.getBoundingClientRect() : null;
  const coachBox = cr && cr.width > 0 && cr.bottom > cr.top ? cr : null;
  const GAP = 4;
  Object.keys(UI.idMarkEls).forEach(s => {
    const mk = UI.idMarkEls[s];
    const seatEl = UI.seatEls[+s];
    if (!mk || !mk.isConnected || !seatEl) return;
    const card = seatEl.querySelector('.gcard');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const sh = mk.offsetHeight || 21;   // 印章尺寸随屏幕宽度变化（17 / 21 / 24）
    const clash = coachBox && r.top - GAP - sh < coachBox.bottom && r.bottom > coachBox.top;
    const drop = below || !!clash;
    mk.style.left = (r.left - wr.left + r.width / 2) + 'px';
    // 印章靠 translate(-100%) 抬到卡顶之上，所以 top 给的是「卡顶减间隙」
    mk.style.top = (drop ? r.bottom - wr.top + GAP : r.top - wr.top - GAP) + 'px';
    mk.style.transform = drop ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';
  });
}

function renderSelf() {
  const p = G.players[0];
  if (!p) return;
  const g = $('#selfGeneral');
  g.className = 'gcard rowcard ' + (p.kingdom || 'qun');
  const skills = p.skills.map(s => SKILLS[s] ? SKILLS[s].name : '').filter(Boolean).join(' · ');
  // 身份印章立在武将卡左侧，不占卡内宽度（横版卡本身很窄，塞进去会被裁掉）
  const si = $('#selfIdentity');
  if (si) si.innerHTML = idBadge(p.identity, { sealOnly: true, cls: 'xs', inspect: 'identity:mine' });
  g.innerHTML = `
    <div class="gc-top">
      <span class="gc-kingdom">${KINGDOM_CN[p.kingdom] || '?'}</span>
      <span class="gc-name">${p.general || '???'}</span>
    </div>
    <div class="gc-hp">${hpDots(p.hp, p.maxHp, false)}${p.flags.chained ? '<span class="gc-chain">链</span>' : ''}</div>
    <div class="gc-bottom"><span class="gc-skill">${skills}${p.flipped ? ' · 翻面' : ''}</span></div>
  `;

  const eq = $('#selfEquip');
  const slots = [['weapon', '武'], ['armor', '防'], ['horsePlus', '+1'], ['horseMinus', '-1']];
  eq.innerHTML = slots.map(([k, lab]) => {
    const c = p.equip[k];
    return `<div class="eq-slot ${c ? 'filled' : ''}" data-inspect="equip:${k}" data-tap="1"><span class="eq-n">${c ? c.name : lab}</span></div>`;
  }).join('');

  const jd = $('#selfJudge');
  jd.innerHTML = p.judgeZone.map(c =>
    `<div class="judge-row" data-inspect="card:${c.uid}" data-tap="1" title="点按看 ${c.name} 的效果">判定区 · ${c.name}<i class="jr-i">ⓘ</i></div>`).join('');
}

function renderHand() {
  const p = G.players[0];
  const area = $('#handArea');
  if (!p) return;
  const key = p.hand.map(c => c.uid).join(',');
  if (key !== UI.lastHandKey) {
    UI.lastHandKey = key;
    area.innerHTML = '';
    p.hand.forEach((c) => {
      const el = cardEl(c);
      el.dataset.inspect = 'card:' + c.uid;
      area.appendChild(el);
    });
  }
  // 布局 & 状态
  const els = [...area.children];
  const n = els.length;
  const maxRot = Math.min(20, n * 2.4);
  const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')) || 66;
  const avail = area.clientWidth - 10;
  let overlap = 20;
  if (n > 1) {
    const natural = cardW * n - overlap * (n - 1);
    if (natural > avail) overlap = Math.min(cardW - 24, (cardW * n - avail) / (n - 1));
  }
  els.forEach((el, i) => {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    el.style.marginLeft = i === 0 ? '0px' : (-overlap).toFixed(1) + 'px';
    el.style.setProperty('--rot', (t * maxRot * .5).toFixed(2) + 'deg');
    el.style.setProperty('--ty', (-Math.abs(t) * 5).toFixed(1) + 'px');
    el.style.zIndex = String(i + 1);
    const card = p.hand[i];
    const sel = UI.sel.cards.some(c => c.uid === card.uid);
    el.classList.toggle('sel', sel);
    const usable = UI.req ? cardSelectable(card) : false;
    el.classList.toggle('dimmed', !!UI.req && !usable);
    el.classList.toggle('disabled', !!UI.req && !usable);
  });
}

/* 由提示卡接管的操作类型：底部操作栏不再重复一份「取消/确定」 */
const MODAL_KINDS = ['yesno', 'choice', 'suit', 'pickOne', 'arrange'];

function renderActionBar() {
  const bar = $('#actionBar');
  const req = UI.req;
  if (!req || MODAL_KINDS.includes(req.kind)) {
    bar.classList.add('hidden');
    $('#skillBar').innerHTML = '';
    return;
  }
  bar.classList.remove('hidden');

  const prompt = $('#actionPrompt');
  const confirm = $('#btnConfirm');
  const cancel = $('#btnCancel');

  let text = req.prompt || defaultPrompt(req);
  if (req.kind === 'play' && UI.sel.cards.length) {
    if (UI.sel.zb) {
      // 丈八蛇矛：凑两张手牌当【杀】
      if (UI.sel.cards.length < 2) text = '【丈八蛇矛】再点一张手牌，两张当【杀】使用';
      else {
        const r = previewUse(G.players[0], UI.sel.cards[0], 'sha');
        if (!r.ok) text = `【杀】${r.msg}`;
        else if (r.need > 0 && UI.sel.targets.length < r.need) {
          text = `【丈八蛇矛】请选择 ${r.need} 个目标（已选 ${UI.sel.targets.length}）`;
        } else text = '【丈八蛇矛】点击确定使用';
      }
    } else {
    const card = UI.sel.cards[0];
    const asId = selAsId();
    const r = previewUse(G.players[0], card, asId);
    if (!r.ok) text = `【${CARD_INFO[asId].name}】${r.msg}`;
    else if (r.need > 0) {
      const max = r.max || r.need;
      if (max > r.need) {
        // 方天画戟等：可以额外选目标，别让提示写成「只能选 1 个」
        const w = G.players[0].equip.weapon;
        text = `【${CARD_INFO[asId].name}】可选择 ${r.need}–${max} 个目标（已选 ${UI.sel.targets.length}）`
          + (w && w.id === 'fangtian' ? ' · 方天画戟' : '');
      } else {
        text = `【${CARD_INFO[asId].name}】请选择 ${r.need} 个目标（已选 ${UI.sel.targets.length}）`;
      }
    }
    else text = `【${CARD_INFO[asId].name}】点击确定使用`;
    }
  }
  let count = '';                       // 弃牌进度（单独一行小签，不冲掉「为什么弃牌」）
  if (req.kind === 'discard') {
    const need = req.min || 1;
    const most = req.max || need;
    const got = UI.sel.cards.length;
    const left = Math.max(0, need - got);
    // 弃牌阶段：把「要弃几张、为什么」说清楚；技能触发的弃牌保留原有说明
    if (req.limit != null) {
      text = `请选择 ${need} 张手牌丢弃 · 现有 ${G.players[0].hand.length} 张 / 上限 ${req.limit} 张`;
    }
    count = left > 0
      ? `已选 ${got}/${need} · 还需 ${left} 张`
      : `已选 ${got}/${most}${most > need ? `（可选至 ${most}）` : ''} · 点「弃牌」确定`;
  }
  if (req.kind === 'target') {
    text = `${req.prompt || '请选择目标'}（${UI.sel.targets.length}/${req.min}）`;
  }
  // 响应牌被转化技改写了牌名（龙胆把【闪】当【杀】打出），说清楚再让玩家确认
  if (req.kind === 'respond' && UI.sel.cards.length === 2) {
    const [a, b] = UI.sel.cards;
    text = `【丈八蛇矛】将「${CARD_INFO[a.id].name}」+「${CARD_INFO[b.id].name}」当【杀】打出 · 点击确定`;
  } else if (req.kind === 'respond' && req.asId && UI.sel.cards.length) {
    const c = UI.sel.cards[0], want = CARD_INFO[req.asId], mine = CARD_INFO[c.id];
    const same = c.id === req.asId || (mine && want && mine.keyword && want.keyword && mine.keyword === want.keyword);
    if (mine && want && !same) text = `将【${mine.name}】当【${want.name}】打出 · 点击确定`;
    else if (req.zhangba && UI.sel.cards.length === 1 && !(req.valid && req.valid(c))) {
      text = '【丈八蛇矛】再点一张手牌，两张当【杀】打出';
    }
  }
  // 标题（弃牌等「要做什么」）：单独一枚金色小签，和正文分开，一眼能看出当前在干什么
  const title = req.title || (req.kind === 'discard' ? '弃牌' : '');
  prompt.textContent = '';
  if (title) {
    const tag = document.createElement('span');
    tag.className = 'ap-title';
    tag.textContent = title;
    prompt.appendChild(tag);
  }
  const body = document.createElement('span');
  body.className = 'ap-txt';
  body.textContent = text;
  prompt.appendChild(body);
  if (count) {
    const num = document.createElement('span');
    num.className = 'ap-count' + (count.indexOf('还需') < 0 ? ' done' : '');
    num.textContent = count;
    prompt.appendChild(num);
  }

  // 按钮
  const isPlay = req.kind === 'play';
  const isDiscard = req.kind === 'discard';
  cancel.textContent = isPlay ? '结束出牌' : '取消';
  cancel.classList.toggle('hidden', req.cancelable === false && !isPlay);
  confirm.classList.toggle('hidden', false);
  confirm.disabled = !canConfirm();
  confirm.textContent = isPlay ? '使用' : (isDiscard ? '弃牌' : '确定');

  // 技能 & 转化
  const sb = $('#skillBar');
  sb.innerHTML = '';
  if (isPlay) {
    const p = G.players[0];
    if (UI.sel.zb && UI.sel.cards.length === 2) {
      const b = h('button', 'skill-chip', '取消丈八蛇矛');
      b.onclick = () => {
        UI.sel.zb = false;
        UI.sel.cards = UI.sel.cards.slice(0, 1);
        UI.sel.targets = [];
        UI.render();
      };
      sb.appendChild(b);
    } else if (UI.sel.cards.length === 1 && !UI.sel.zb) {
      const card = UI.sel.cards[0];
      // 重铸（铁索连环）：弃置此牌并摸一张，不占用目标
      if (CARD_INFO[card.id] && CARD_INFO[card.id].recast) {
        const rc = h('button', 'skill-chip recast', '重铸 · 弃置摸一张');
        rc.onclick = () => finish({ action: 'recast', card });
        sb.appendChild(rc);
      }
      const views = viewsOf(p, card).filter(v => v.id !== card.id);
      views.forEach(v => {
        const b = h('button', 'skill-chip' + (UI.sel.asId === v.id ? ' lord' : ''), `当【${v.label}】使用`);
        b.onclick = () => { UI.sel.asId = (UI.sel.asId === v.id ? null : v.id); UI.sel.targets = []; UI.render(); };
        sb.appendChild(b);
      });
      if (UI.sel.asId) {
        const b = h('button', 'skill-chip', `按【${CARD_INFO[card.id].name}】使用`);
        b.onclick = () => { UI.sel.asId = null; UI.sel.targets = []; UI.render(); };
        sb.appendChild(b);
      }
      // 丈八蛇矛：两张手牌当【杀】
      if (canZhangba(p)) {
        const zb = h('button', 'skill-chip', '丈八蛇矛 · 再选一张当【杀】');
        zb.onclick = () => { UI.sel.zb = true; UI.sel.asId = null; UI.sel.targets = []; UI.render(); };
        sb.appendChild(zb);
      }
    } else if (!UI.sel.zb) {
      (req.options || []).forEach(o => {
        const b = h('button', 'skill-chip', o.name);
        b.onclick = () => finish({ action: 'skill', id: o.id });
        sb.appendChild(b);
      });
    }
  }
}

function defaultPrompt(req) {
  const map = {
    play: '出牌阶段', respond: '请选择要打出的牌', discard: '请选择要弃置的牌',
    target: '请选择目标', save: '濒死求桃', wuxie: '是否使用【无懈可击】？',
  };
  return map[req.kind] || '';
}

/* ================= 动作横幅 =================
 * 引擎通过 G.beat 暂停节奏，这里展示「谁 使用【什么】→ 目标」 */
const BANNER = {
  el: null, timer: 0, payload: null,
  ensure() {
    if (!this.el) this.el = document.getElementById('banner');
    return this.el;
  },
  show(html, ms, data, low) {
    const el = this.ensure();
    if (!el) return;
    this.payload = data || null;
    // low：动作类横幅下移，避免压住左右两侧的武将卡
    el.classList.toggle('low', !!low);
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.classList.remove('pop');
    void el.offsetWidth;           // 重启动画
    el.classList.add('pop');
    clearTimeout(this.timer);
    if (ms) this.timer = setTimeout(() => this.hide(), ms);
  },
  hide() {
    if (this.el) this.el.classList.add('hidden');
    clearTimeout(this.timer);
  },
};

/* 横幅里的牌：本身就是「看这张牌」的入口 */
function bannerCard(card) {
  const el = cardEl(card, { cls: 'mini' });
  return `<span class="bn-card bn-p" data-act="card" data-inspect="card:${card.uid}">${el.outerHTML}</span>`;
}

/* 横幅里的名字：点开武将详情 */
function bnName(p, txt, cls) {
  if (!p) return `<span class="${cls || ''}">${txt}</span>`;
  return `<span class="bn-p ${cls || ''}" data-act="seat:${p.seat}" data-inspect="general:${p.seat}">${txt}</span>`;
}

function showPlayBanner(d) {
  const who = d.player ? d.player.name : '';
  const me = d.player && d.player.seat === 0;
  const verb = d.judge ? '判定'
    : d.respond ? '打出'
    : d.equip ? '装备了'
    : '使用';
  const asInfo = (d.asId && d.card && d.asId !== d.card.id) ? CARD_INFO[d.asId] : null;
  const asChip = asInfo ? `<span class="bn-p bn-as" data-act="as">当【${asInfo.name}】</span>` : '';
  let targets = '';
  if (d.targets && d.targets.length) {
    if (d.targets.length > 2) {
      // 目标太多时聚合显示，避免横幅爆宽
      targets = `<span class="bn-goto"><span class="bn-to">→</span><span class="bn-p bn-targets" data-act="targets">共 ${d.targets.length} 名角色</span></span>`;
    } else {
      const names = d.targets.map(t => bnName(t, t.name)).join('<i class="bn-sep">、</i>');
      targets = `<span class="bn-goto"><span class="bn-to">→</span><span class="bn-targets">${names}</span></span>`;
    }
  }
  BANNER.show(`
    <div class="bn-row">
      ${bnName(d.player, who, 'bn-who' + (me ? ' me' : ''))}
      <span class="bn-verb">${verb}</span>
      ${d.card ? bannerCard(d.card) : ''}
      ${asChip}
      ${targets}
    </div>`, 0, d, true);

  // 牌桌上再画一条「谁 → 谁」，让影响的目标一眼可见
  if (window.FX && !d.judge && d.player && d.targets && d.targets.length) {
    const info = CARD_INFO[d.asId || (d.card && d.card.id)];
    window.FX.act(d.player, d.targets, info ? info.name : '',
      { life: d.respond ? 800 : 1050 });
  }
}

function showTurnBanner(d) {
  const me = d.player && d.player.seat === 0;
  BANNER.show(`
    <div class="bn-turn">
      <span class="bn-turn-sep">—</span>
      ${bnName(d.player, me ? '你 的回合' : d.player.name + ' 的回合', 'bn-turn-name' + (me ? ' me' : ''))}
      <span class="bn-turn-sep">—</span>
    </div>`, 0, d);
}

function showPhaseBanner(d) {
  const me = d.player && d.player.seat === 0;
  const ph = { prepare: '准备阶段', judge: '判定阶段', draw: '摸牌阶段', play: '出牌阶段', discard: '弃牌阶段' }[d.phase] || d.phase;
  // 自己的出牌阶段不要横幅遮挡（操作提示条已有提示）
  if (me && d.phase === 'play') return;
  BANNER.show(`
    <div class="bn-phase">
      ${bnName(d.player, me ? '你' : d.player.name, 'bn-phase-who' + (me ? ' me' : ''))}
      <span class="bn-phase-name">${ph}</span>
    </div>`, 900, d);
}

function showDmgBanner(d) {
  const nat = d.nature === 'fire' ? '🔥' : d.nature === 'thunder' ? '⚡' : '';
  BANNER.show(`
    <div class="bn-dmg">
      ${bnName(d.target, d.target.name, 'bn-dmg-who')}
      <span class="bn-dmg-n">-${d.amount}</span>
      <span class="bn-dmg-txt">${nat}受到伤害</span>
      ${d.source ? `<span class="bn-dmg-src">（来自 ${bnName(d.source, d.source.name)}）</span>` : ''}
    </div>`, 1100, d, true);
  if (window.FX) {
    const k = d.nature === 'fire' ? 'fire' : d.nature === 'thunder' ? 'thunder' : 'dmg';
    window.FX.hit(d.target.seat, '-' + d.amount, k);
  }
}

/* 濒死：血雾 + 目标身上的「濒死」标记。
   中间再弹一句会和武将卡打架，这里不弹横幅。 */
function showDyingBanner(d) {
  BANNER.hide();                       // 伤害横幅会压住濒死的人，先收掉
  if (window.FX) window.FX.dying(d.player.seat);
}

/* 救援：谁 → 谁，用了什么牌，让「突然回了一点血」有来由 */
function showSaveBanner(d) {
  const me = d.savior && d.savior.seat === 0;
  const tgtMe = d.target && d.target.seat === 0;
  BANNER.show(`
    <div class="bn-row">
      ${bnName(d.savior, me ? '你' : d.savior.name, 'bn-who' + (me ? ' me' : ''))}
      <span class="bn-verb">救援</span>
      ${bannerCard(d.card)}
      <span class="bn-goto"><span class="bn-to">→</span>
        <span class="bn-targets">${bnName(d.target, tgtMe ? '你' : d.target.name)}</span></span>
      <span class="bn-heal">+${d.amount || 1}</span>
    </div>`, 1000, d, true);
  if (window.FX) window.FX.act(d.savior, [d.target], '', { kind: 'save', life: 950 });
}

function showDeathBanner(d) {
  const me = d.player && d.player.seat === 0;
  BANNER.show(`
    <div class="bn-dmg dead">
      ${bnName(d.player, me ? '你' : d.player.name, 'bn-dmg-who')}
      <span class="bn-dmg-n">阵亡</span>
      <span class="bn-dmg-txt">退出对局</span>
    </div>`, 900, d, true);
  if (window.FX) window.FX.death(d.player.seat);
}

/* 横幅点击：牌 → 牌详情；名字 → 武将详情；多目标 → 目标列表 */
function showBannerCard(card, asId) {
  if (!card) return;
  openCardSheet(card, { noStatus: true, asId: asId || null });
}

function bannerTap(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  e.stopPropagation();
  const act = el.dataset.act;
  const d = BANNER.payload || {};
  if (act === 'card') showBannerCard(d.card, d.asId);
  else if (act === 'as') showBannerCard({ id: d.asId, suit: 'none', num: 0, uid: -1 });
  else if (act === 'targets') openTargetsSheet(d.targets);
  else if (act.indexOf('seat:') === 0) {
    const p = G.players.find(x => x.seat === +act.slice(5));
    if (p) openGeneralSheet(p);
  }
}

/* 中央处理区 */
function renderProcess() {
  const slot = $('#processSlot');
  if (G.processing) {
    const key = 'p' + G.processing.uid;
    if (slot.dataset.key !== key) {
      slot.dataset.key = key;
      slot.innerHTML = '';
      const el = cardEl(G.processing, { cls: 'mini' });
      el.style.transform = 'scale(1.35)';
      el.style.transformOrigin = 'center';
      slot.appendChild(el);
    }
    slot.classList.add('active');
  } else {
    if (slot.dataset.key) { slot.innerHTML = ''; slot.dataset.key = ''; }
    slot.classList.remove('active');
  }
  const ph = { prepare: '准备', judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌', end: '结束' }[G.phase] || '';
  $('#phaseTip').textContent = ph;
  const cur = G.players[G.current];
  const tn = $('#turnName');
  if (tn) {
    tn.textContent = cur && cur.alive ? cur.name : '';
    tn.classList.toggle('me', cur && cur.seat === 0);
  }
}

/* ================= 可用性与目标原因 ================= */

/* 没有任何合法目标时的原因说明 */
/* 没目标时给出「具体是为什么」，而不是一句不合法 */
function noTargetReason(p, asId, card) {
  // 距离内有人，但被打不动——防具挡的
  if (isShaId(asId)) {
    const inRange = alivePlayers().filter(x => x !== p && inAttackRange(p, x));
    const has = (id) => inRange.filter(x => x.equip.armor && x.equip.armor.id === id);
    if (!ignoreArmorOf(p)) {
      if (!natureOf(asId) && has('tengjia').length) return '【藤甲】使普通【杀】无效，请改用火【杀】/雷【杀】';
      if (isBlack(card) && has('renwang').length) return '【仁王盾】使黑色【杀】无效，请改用红色【杀】';
    }
    if (inRange.length && inRange.every(x => hasSkill(x, 'kongcheng') && x.hand.length === 0)) return '【空城】：对方没有手牌，不能成为【杀】的目标';
  }
  const map = {
    sha: '攻击范围内没有其他角色', huosha: '攻击范围内没有其他角色', leisha: '攻击范围内没有其他角色',
    juedou: '没有可决斗的其他角色',
    guohe: '没有可弃牌的其他角色',
    shunshou: '距离 1 以内没有有牌的其他角色',
    jiedao: '没有装备武器的其他角色',
    huogong: '没有有手牌的角色',
    lebu: '没有可使用的目标',
    bingliang: '距离 1 以内没有可使用的目标',
    tiesuo: '没有可选的角色',
  };
  return map[asId] || '当前没有合法目标';
}

/* 指定「当作某张牌使用」时的可用性；返回空串表示可用 */
function reasonFor(me, card, asId) {  if (isShaId(asId)) {
    const zhuge = me.equip.weapon && me.equip.weapon.id === 'zhuge';
    if (!hasSkill(me, 'paoxiao') && !zhuge && me.shaCount >= 1) return '本回合已使用过【杀】';
  }
  if (asId === 'tao' && me.hp >= me.maxHp) return '体力已满，无需使用【桃】';
  if (asId === 'jiu' && me.jiuUsed) return '本回合已使用过【酒】';
  if (asId === 'shandian' && HAS_JUDGE(me, 'shandian')) return '你的判定区已有【闪电】';
  if (asId === 'shan') return '【闪】只能在成为【杀】的目标时打出';
  if (asId === 'wuxie') return '【无懈可击】只能在锦囊生效前打出';
  // 装备不需要目标，直接进入装备区
  if (isEquip(asId)) return '';
  const tc = targetCountRange(me, asId, card);
  if (!tc.auto && tc.min > 0 && !validTargets(me, asId, card).length) return noTargetReason(me, asId, card);
  return '';
}

/* 出牌阶段：这张牌现在能不能用？返回不可用的原因（可为空串） */
function cardPlayReason(card) {
  const me = G.players[0];
  if (!me || !UI.req || UI.req.kind !== 'play') return '';
  // 有转化技时不禁用，让玩家自行选择转化方式
  const cands = [card.id];
  try {
    viewsOf(me, card).forEach(v => { if (v.id !== card.id && cands.indexOf(v.id) < 0) cands.push(v.id); });
  } catch (e) { }
  let reason = '';
  for (const id of cands) {
    const r = reasonFor(me, card, id);
    if (!r) return '';
    if (!reason) reason = r;
  }
  return reason;
}

/* 某个座位作为目标的合法性 + 距离 + 原因 */
function targetInfo(p, asId, card) {
  const me = G.players[0];
  if (!me || !p) return { ok: false, dist: 0, reason: '' };
  const d = distance(me, p);
  if (validTargets(me, asId, card).indexOf(p) >= 0) return { ok: true, dist: d, reason: '' };
  if (!p.alive) return { ok: false, dist: d, reason: '已阵亡' };
  const black = isBlack(card);
  let reason = '';
  if (isShaId(asId)) {
    if (p === me) reason = '不能对自己使用';
    else if (d > attackRange(me)) reason = '距离 ' + d + '，超出攻击范围 ' + attackRange(me);
    else if (hasSkill(p, 'kongcheng') && p.hand.length === 0) reason = '空城：不可成为【杀】的目标';
    else if (!ignoreArmorOf(me)) {
      if (p.equip.armor && p.equip.armor.id === 'renwang' && black) reason = '仁王盾：黑色【杀】无效';
      else if (p.equip.armor && p.equip.armor.id === 'tengjia' && !natureOf(asId)) reason = '藤甲：普通【杀】无效，请改用火【杀】/雷【杀】';
    }
    if (!reason) reason = '不可作为目标';
  } else if (asId === 'juedou') {
    if (p === me) reason = '不能对自己使用';
    else if (hasSkill(p, 'kongcheng') && p.hand.length === 0) reason = '空城：不可成为【决斗】的目标';
    else reason = '不可作为目标';
  } else if (asId === 'guohe') {
    if (p === me) reason = '不能对自己使用';
    else if (cardsOf(p).length === 0) reason = '该角色没有牌';
    else if (hasSkill(p, 'weimu') && black) reason = '帷幕：不可成为黑色锦囊的目标';
    else reason = '不可作为目标';
  } else if (asId === 'shunshou') {
    if (p === me) reason = '不能对自己使用';
    else if (cardsOf(p).length === 0) reason = '该角色没有牌';
    else if (d > 1) reason = '距离 ' + d + '，超出范围（需 1 以内）';
    else if (hasSkill(p, 'qianxun')) reason = '谦逊：不能成为【顺手牵羊】的目标';
    else if (hasSkill(p, 'weimu') && black) reason = '帷幕：不可成为黑色锦囊的目标';
    else reason = '不可作为目标';
  } else if (asId === 'jiedao') {
    if (!p.equip.weapon) reason = '该角色没有装备武器';
    else reason = '不可作为目标';
  } else if (asId === 'huogong') {
    if (p.hand.length === 0) reason = '该角色没有手牌';
    else if (hasSkill(p, 'weimu') && black) reason = '帷幕：不可成为黑色锦囊的目标';
    else reason = '不可作为目标';
  } else if (asId === 'lebu') {
    if (hasSkill(p, 'qianxun')) reason = '谦逊：不能成为【乐不思蜀】的目标';
    else if (HAS_JUDGE(p, 'lebu')) reason = '该角色判定区已有【乐不思蜀】';
    else reason = '不可作为目标';
  } else if (asId === 'bingliang') {
    if (d > 1) reason = '距离 ' + d + '，超出范围（需 1 以内）';
    else if (HAS_JUDGE(p, 'bingliang')) reason = '该角色判定区已有【兵粮寸断】';
    else reason = '不可作为目标';
  } else {
    reason = '不可作为目标';
  }
  return { ok: false, dist: d, reason: reason };
}

/* ================= 交互校验 ================= */

/* 当前选中的牌要「当作」哪张牌使用 */
function selAsId() {
  const first = UI.sel.cards[0];
  if (!first) return null;
  if (UI.sel.zb) return 'sha';              // 丈八蛇矛：两张手牌当【杀】
  return UI.sel.asId || first.id;
}

function cardSelectable(card) {
  const req = UI.req;
  if (!req) return false;
  if (req.kind === 'play') {
    if (!G.players[0].hand.some(c => c.uid === card.uid)) return false;
    if (UI.sel.zb) return true;            // 丈八模式：任意手牌都能当第二张
    return !cardPlayReason(card);
  }
  if (req.kind === 'respond') {
    if (req.valid && req.valid(card)) return true;
    // 丈八蛇矛：响应时也可以用两张手牌当【杀】
    return !!req.zhangba && G.players[0].hand.some(c => c.uid === card.uid);
  }
  if (req.kind === 'save') return req.valid ? !!req.valid(card) : true;
  if (req.kind === 'wuxie') return card.id === 'wuxie';
  if (req.kind === 'discard') {
    // pool / cards 用来限定可弃的牌（火攻只能弃同花色、缔盟只能弃指定范围）
    const pool = req.pool || (Array.isArray(req.cards) && req.cards.length ? req.cards : G.players[0].hand);
    return pool.some(c => c.uid === card.uid);
  }
  return false;
}

function previewUse(p, card, asId) {
  const info = CARD_INFO[asId];
  if (!info) return { ok: false, msg: '无法使用' };
  // 装备牌直接装进装备区，不需要目标
  if (info.type === 'equip') return { ok: true, need: 0, targetPool: [] };
  if (isShaId(asId)) {
    if (!hasSkill(p, 'paoxiao') && !(p.equip.weapon && p.equip.weapon.id === 'zhuge') && p.shaCount >= 1) {
      return { ok: false, msg: '本回合已使用过【杀】' };
    }
  }
  const tc = targetCountRange(p, asId, card);
  if (tc.auto) return { ok: true, need: 0, targetPool: [] };
  const legal = validTargets(p, asId, card);
  if (!legal.length) return { ok: false, msg: noTargetReason(p, asId, card) };
  return { ok: true, need: tc.min, max: tc.max, targetPool: legal };
}

function canTargetSeat(p) {
  if (!p.alive) return false;
  const req = UI.req;
  if (req && req.kind === 'target') return isCandidate(p);
  if (!req || req.kind !== 'play') return false;
  if (UI.sel.cards.length !== (UI.sel.zb ? 2 : 1)) return false;
  const card = UI.sel.cards[0];
  const asId = selAsId();
  const r = previewUse(G.players[0], card, asId);
  return r.ok && r.targetPool && r.targetPool.includes(p);
}

function isCandidate(p) {
  const req = UI.req;
  return !!(req && req.candidates && req.candidates.some(c => c.seat === p.seat));
}

function canConfirm() {
  const req = UI.req;
  if (!req) return false;
  if (req.kind === 'play') {
    if (!UI.sel.cards.length) return false;
    if (UI.sel.zb && UI.sel.cards.length !== 2) return false;   // 丈八要两张
    const card = UI.sel.cards[0];
    const asId = selAsId();
    const r = previewUse(G.players[0], card, asId);
    if (!r.ok) return false;
    if (r.need > 0 && UI.sel.targets.length < r.need) return false;
    return true;
  }
  if (req.kind === 'respond') {
    if (UI.sel.cards.length === 1) return req.valid ? !!req.valid(UI.sel.cards[0]) : true;
    return !!req.zhangba && UI.sel.cards.length === 2;
  }
  if (req.kind === 'wuxie' || req.kind === 'save') return UI.sel.cards.length === 1;
  if (req.kind === 'discard') return UI.sel.cards.length >= (req.min || 1) && UI.sel.cards.length <= (req.max || 99);
  if (req.kind === 'target') return UI.sel.targets.length >= (req.min || 1);
  return false;
}

/* ================= 点击处理 ================= */

function onCardClick(card) {
  const req = UI.req;
  if (!req) return;
  if (!cardSelectable(card)) {
    // 确认 / 抉择这类请求期间，点牌没有意义（长按仍可看牌），别弹「不能用」打扰
    if (req.kind === 'yesno' || req.kind === 'choice' || req.kind === 'suit'
      || req.kind === 'pickOne' || req.kind === 'arrange') return;
    const why = req.kind === 'play' ? cardPlayReason(card) : '';
    toast(why || '这张牌现在不能使用');
    return;
  }
  const idx = UI.sel.cards.findIndex(c => c.uid === card.uid);
  if (idx >= 0) {
    UI.sel.cards.splice(idx, 1);
    if (req.kind === 'play') UI.sel.targets = [];
  } else {
    // 丈八蛇矛：出牌阶段 / 响应时都可以凑两张手牌当【杀】
    const multi = (req.kind === 'play' && UI.sel.zb) || (req.kind === 'respond' && req.zhangba);
    if (multi) {
      if (UI.sel.cards.length >= 2) { toast('最多只能选两张牌'); return; }
      UI.sel.cards.push(card);
      if (req.kind === 'play') UI.sel.targets = [];
    } else if (req.kind === 'play' || req.kind === 'respond' || req.kind === 'wuxie' || req.kind === 'save') {
      UI.sel.cards = [card];
      UI.sel.asId = null;
      UI.sel.targets = UI.sel.targets.filter(t => t.alive);
    } else {
      const max = req.max || 99;
      if (UI.sel.cards.length >= max) UI.sel.cards.shift();
      UI.sel.cards.push(card);
      UI.sel.targets = UI.sel.targets.filter(t => t.alive);
    }
  }
  UI.render();
}

function onSeatClick(seat) {
  const p = G.players.find(x => x.seat === seat);
  if (!p) return;
  const req = UI.req;
  if (!req) return;
  if (req.kind === 'target') {
    if (!isCandidate(p)) { toast('该目标不在本次可选范围内'); return; }
    const i = UI.sel.targets.findIndex(t => t.seat === seat);
    if (i >= 0) UI.sel.targets.splice(i, 1);
    else {
      const max = req.max || req.min || 1;
      if (UI.sel.targets.length >= max) { toast(`最多只能选择 ${max} 个目标`); return; }
      UI.sel.targets.push(p);
    }
    UI.render();
    return;
  }
  if (req.kind === 'play' && UI.sel.cards.length === (UI.sel.zb ? 2 : 1)) {
    if (!canTargetSeat(p)) {
      const card = UI.sel.cards[0];
      const asId = selAsId();
      const ti = targetInfo(p, asId, card);
      toast(ti.reason || '该目标不合法');
      return;
    }
    const i = UI.sel.targets.findIndex(t => t.seat === seat);
    if (i >= 0) UI.sel.targets.splice(i, 1);
    else {
      const card = UI.sel.cards[0];
      const asId = selAsId();
      const r = previewUse(G.players[0], card, asId);
      const max = r.max || 1;
      if (UI.sel.targets.length >= max) { toast(`最多只能选择 ${max} 个目标`); return; }
      UI.sel.targets.push(p);
    }
    UI.render();
  }
}

/* ================= 提交 ================= */

function onConfirm() {
  const req = UI.req;
  if (!req || !canConfirm()) return;
  if (req.kind === 'play') {
    const card = UI.sel.cards[0];
    const asId = selAsId();
    const r = previewUse(G.players[0], card, asId);
    let targets = UI.sel.targets.slice();
    if (r.need === 0) targets = [];
    const extra = UI.sel.zb ? UI.sel.cards.slice(1) : [];
    finish({
      action: 'use', card, targets,
      asId: asId !== card.id ? asId : undefined,
      extraCards: extra.length ? extra : undefined,
    });
    return;
  }
  if (req.kind === 'respond') {
    if (UI.sel.cards.length === 2) finish({ cards: UI.sel.cards.slice() });
    else finish({ card: UI.sel.cards[0] });
    return;
  }
  if (req.kind === 'wuxie' || req.kind === 'save') {
    finish({ card: UI.sel.cards[0] });
    return;
  }
  if (req.kind === 'discard') {
    finish({ cards: UI.sel.cards.slice() });
    return;
  }
  if (req.kind === 'target') {
    finish({ targets: UI.sel.targets.slice() });
  }
}

function onCancel() {
  const req = UI.req;
  if (!req) return;
  if (req.kind === 'play') { finish({ action: 'end' }); return; }
  if (req.cancelable === false) return;
  finish(null);
}

function finish(res) {
  const fn = UI.resolve;
  UI.req = null;
  UI.resolve = null;
  UI.player = null;
  UI.sel = { cards: [], targets: [], asId: null, zb: false };
  closeModal();
  UI.render();
  if (fn) fn(res);
}

/* ================= 弹层 ================= */

/* 提示卡（非模态）：opts.prompt = true 时不加遮罩、底边贴住牌桌上沿，
   并且带一个「收起」按钮，收起后变成一个悬浮胶囊 / 战报底栏 */
function openModal(html, onMount, opts) {
  opts = opts || {};
  const m = $('#modal');
  const box = $('#modalBox');
  const prompt = !!opts.prompt;
  m.classList.toggle('prompt', prompt);
  m.classList.remove('mini');
  PROMPT.mini = false;
  PROMPT.miniBy = '';
  box.innerHTML = prompt
    ? `<div class="p-bar"><span class="p-tag"><i class="pc-dot"></i>待你响应</span>`
      + `<button class="p-mini" id="pMini">收起 ⌄</button></div>${html}`
    : html;
  // 横屏手机：是/否这类短提示改成一条横卡，别把牌桌全糊住
  box.classList.toggle('compact', !!opts.compact && isLandscapePhone());
  m.classList.remove('hidden');
  if (prompt) {
    computePromptBottom();
    const b = box.querySelector('#pMini');
    if (b) b.onclick = () => minimizePrompt('user');
  }
  refreshPendingUI();
  if (onMount) onMount(box);
}
function closeModal() {
  const m = $('#modal');
  m.classList.add('hidden');
  m.classList.remove('prompt', 'mini');
  $('#modalBox').innerHTML = '';
  $('#modalBox').classList.remove('compact');
  PROMPT.mini = false;
  PROMPT.miniBy = '';
  UI.modalResolve = null;
  refreshPendingUI();
}

/* 提示卡与浮动胶囊的公共状态 */
const PROMPT = { mini: false, miniBy: '' };

/* 提示卡底边 = 自己的手牌区上沿，避免盖住手牌 */
function computePromptBottom() {
  // 横屏手机：整个底部只有 ~130px，卡片一律落在「自己的武将栏」之上，
  // 保证手牌照常可点（判断要不要用【无懈可击】/【鬼才】时要看着手牌决定）
  if (isLandscapePhone()) {
    const row = $('#selfRow');
    // 卡片底边 = 自己武将栏上沿 − 6px；用实测坐标算，别用高度相加（底部还有安全区留白）
    const top = row ? row.getBoundingClientRect().top : innerHeight - 130;
    const bottom = Math.max(10, Math.round(innerHeight - top + 6));
    document.documentElement.style.setProperty('--prompt-bottom', bottom + 'px');
    return;
  }
  const self = $('#selfArea');
  let h = self ? self.getBoundingClientRect().height : 150;
  h = h + 8;
  const max = Math.round(innerHeight * 0.46);
  h = Math.max(56, Math.min(h, max));
  document.documentElement.style.setProperty('--prompt-bottom', Math.round(h) + 'px');
}

/* 一句话概括「现在要你做什么」，用于收起后的胶囊 / 战报底栏 */
function promptLabel(req) {
  if (!req) return '待你响应';
  if (req.skill && typeof SKILLS !== 'undefined' && SKILLS[req.skill]) {
    return `是否发动【${SKILLS[req.skill].name}】`;
  }
  const byKind = {
    yesno: '需要确认', choice: '需要抉择', suit: '需要选花色',
    pickOne: '需要选一张牌', arrange: '需要排列牌堆',
    play: '轮到你出牌', respond: '需要打出牌', discard: '需要弃牌',
    save: '有人濒死', target: '需要选择目标',
  };
  const txt = String(req.prompt || '').replace(/<[^>]+>/g, '').trim();
  if (txt) return txt.length > 16 ? txt.slice(0, 16) + '…' : txt;
  return byKind[req.kind] || '待你响应';
}

function minimizePrompt(by) {
  const m = $('#modal');
  if (!m.classList.contains('prompt') || m.classList.contains('hidden')) return;
  m.classList.add('mini');
  PROMPT.mini = true;
  PROMPT.miniBy = by || 'user';
  refreshPendingUI();
}

function expandPrompt() {
  const m = $('#modal');
  if (!m.classList.contains('prompt')) return;
  m.classList.remove('mini');
  PROMPT.mini = false;
  PROMPT.miniBy = '';
  computePromptBottom();
  refreshPendingUI();
}

/* 有指令在等玩家时，保证「一定看得见」：
   战报开着 → 面板底部提示条；否则收起后 → 悬浮胶囊 */
function refreshPendingUI() {
  const has = !!UI.req;
  const logOpen = !$('#logPanel').classList.contains('hidden');
  const label = promptLabel(UI.req);

  const chip = $('#promptChip');
  if (chip) {
    const show = has && PROMPT.mini && !logOpen;
    chip.classList.toggle('hidden', !show);
    if (has) chip.querySelector('.pc-txt').textContent = label;
  }
  const lp = $('#logPending');
  if (lp) {
    const show = has && logOpen;
    lp.classList.toggle('hidden', !show);
    if (has) lp.querySelector('.lp-txt').textContent = label;
  }

  // 结算被收起后：战报没开 → 悬浮胶囊；战报开着 → 战报底部「看结算」
  const ended = !!UI.resultMini;
  const rc = $('#resultChip');
  if (rc) rc.classList.toggle('hidden', !(ended && !logOpen));
  const lr = $('#logResult');
  if (lr) lr.classList.toggle('hidden', !(ended && logOpen));
}
UI.refreshPendingUI = refreshPendingUI;
UI.expandPrompt = expandPrompt;

function modalChoose(html, onMount) {
  return new Promise(res => {
    UI.modalResolve = res;
    openModal(html, onMount);
  });
}

/* 各类需要弹层的请求 */
UI.prompt = function (player, req) {
  // 调试/测试用：非出牌请求交给 AI 自动处理
  if (window.__AUTO_HANDLE && req.kind !== 'play') {
    return Promise.resolve(AI.decide(player, req)).then(r => r || null);
  }
  return new Promise(resolve => {
    // 新请求意味着上一张提示卡已经作废，别让它留在屏幕上
    if ($('#modal').classList.contains('prompt')) closeModal();
    // 轮到自己出牌 / 选目标时收起横幅：它压着左右两家的武将卡，
    // 而横幅里的牌和名字是可点的，留着会挡住点选目标。
    if (req.kind === 'play' || req.kind === 'target') BANNER.hide();
    UI.req = req;
    UI.player = player;
    UI.resolve = resolve;
    UI.sel = { cards: [], targets: [], asId: null, zb: false };
    UI.render();
    if (req.kind === 'yesno') showYesNo(req);
    else if (req.kind === 'choice') showChoice(req);
    else if (req.kind === 'suit') showSuit(req);
    else if (req.kind === 'pickOne') showPickOne(req);
    else if (req.kind === 'arrange') showArrange(req);
    // 正在看战报时不把提示卡糊上去，收到战报底栏里
    if (!$('#logPanel').classList.contains('hidden')) minimizePrompt('log');
    else refreshPendingUI();
  });
};

function showYesNo(req) {
  openModal(`
    <div class="m-title">${req.skill && SKILLS[req.skill] ? SKILLS[req.skill].name : '选择'}</div>
    <div class="m-body p-line">${req.prompt || ''}</div>
    <div class="m-actions">
      <button class="btn sm" id="mNo">否</button>
      <button class="btn sm primary" id="mYes">是</button>
    </div>`, null, { prompt: true, compact: true });
  $('#mYes').onclick = () => finish({ yes: true });
  $('#mNo').onclick = () => finish({ yes: false });
}

function showChoice(req) {
  openModal(`
    <div class="m-title">抉择</div>
    <div class="m-body" style="margin:8px 0 12px;text-align:center">${req.prompt || ''}</div>
    <div id="mOpts"></div>`, box => {
    const wrap = box.querySelector('#mOpts');
    (req.options || []).forEach(o => {
      const b = h('button', 'opt-btn', o.label);
      b.onclick = () => finish({ option: o.id });
      wrap.appendChild(b);
    });
  }, { prompt: true });
}

function showSuit(req) {
  openModal(`
    <div class="m-title">选择花色</div>
    <div class="m-body" style="margin:8px 0 14px;text-align:center">${req.prompt || ''}</div>
    <div class="suit-grid">
      <button class="suit-btn red" data-s="h">♥</button>
      <button class="suit-btn red" data-s="d">♦</button>
      <button class="suit-btn blk" data-s="s">♠</button>
      <button class="suit-btn blk" data-s="c">♣</button>
    </div>`, box => {
    box.querySelectorAll('.suit-btn').forEach(b => {
      b.onclick = () => finish({ suit: b.dataset.s });
    });
  }, { prompt: true });
}

function showPickOne(req) {
  openModal(`
    <div class="m-title">选择一张牌</div>
    <div class="m-body" style="text-align:center;margin:6px 0 14px">${req.prompt || ''}</div>
    <div class="pick-list" id="mPick"></div>`, box => {
    const wrap = box.querySelector('#mPick');
    (req.cards || []).forEach(c => {
      const el = cardEl(c);
      el.style.marginLeft = '0';
      el.onclick = () => finish({ card: c });
      wrap.appendChild(el);
    });
  }, { prompt: true });
}

function showArrange(req) {
  openModal(`
    <div class="m-title">观星</div>
    <div class="m-body" style="text-align:center;margin:6px 0 10px;font-size:12px;color:#9c8f78">
      点击选择置于牌堆顶的牌（按点击顺序自顶向下），未选的置于牌堆底
    </div>
    <div class="pick-list" id="mArr"></div>
    <div class="m-actions"><button class="btn sm primary" id="mArrOk">确定</button></div>`, box => {
    let order = [];
    const wrap = box.querySelector('#mArr');
    (req.cards || []).forEach(c => {
      const el = cardEl(c);
      el.style.marginLeft = '0';
      el.onclick = () => {
        const i = order.findIndex(x => x.uid === c.uid);
        if (i >= 0) { order.splice(i, 1); el.style.outline = ''; }
        else { order.push(c); el.style.outline = '2px solid #ecd49a'; }
        [...wrap.children].forEach(ch => {
          const idx = order.findIndex(x => x.uid === +ch.dataset.uid);
          if (idx >= 0) ch.dataset.idx = String(idx + 1);
          else ch.dataset.idx = '';
        });
      };
      wrap.appendChild(el);
    });
    box.querySelector('#mArrOk').onclick = () => {
      const bottom = (req.cards || []).filter(c => !order.some(o => o.uid === c.uid));
      finish({ top: order.length ? order : (req.cards || []), bottom });
    };
  }, { prompt: true });
}

/* ================= 日志 ================= */

/* 读者滚上去了就别再自动贴底，否则新消息会把正在读的那段顶走 */
UI.logStick = true;
UI.logUnread = 0;

function paintLogNew() {
  const b = $('#logNew');
  if (!b) return;
  if (UI.logUnread > 0) {
    b.textContent = `↓ ${UI.logUnread} 条新消息`;
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
}

/* 日志 DOM 上限：正常跟随时 240 条；读者翻上去时先不裁，
   否则删掉顶部节点会把正在读的位置整段推走 */
const LOG_CAP = 240;
const LOG_CAP_READING = 600;

function trimLog(cap) {
  const list = $('#logList');
  if (!list) return;
  while (list.children.length > (cap || LOG_CAP)) list.removeChild(list.firstChild);
}

UI.onLog = function (entry) {
  const list = $('#logList');
  if (!list) return;
  // 战报里的武将名 /【牌名】做成可点词条（inspect.js 提供，加载晚于本文件）
  const html = (typeof logHtml === 'function') ? logHtml(entry.text) : entry.text;
  const el = h('div', 'lg ' + (entry.cls || ''), html);
  list.appendChild(el);
  const hidden = $('#logPanel').classList.contains('hidden');
  const reading = !hidden && !UI.logStick;
  if (reading) {
    // 读者可能在中段，先不裁；超上限再裁，避免 DOM 无限增长
    trimLog(LOG_CAP_READING);
    UI.logUnread++;
    paintLogNew();
  } else {
    trimLog();
    list.scrollTop = list.scrollHeight;   // 面板隐藏时无效，openLog 会补上
    if (UI.logUnread) { UI.logUnread = 0; paintLogNew(); }
  }
};

function openLog() {
  const panel = $('#logPanel');
  panel.classList.remove('hidden');
  document.body.classList.add('log-open');
  const list = $('#logList');
  UI.logStick = true;
  UI.logUnread = 0;
  paintLogNew();
  trimLog();
  list.scrollTop = list.scrollHeight;
  // 正在等你操作：收进战报底栏，不糊在正文上（玩家自己收起的就别动）
  if (UI.req && !PROMPT.mini) minimizePrompt('log');
  refreshPendingUI();
}

function closeLog() {
  $('#logPanel').classList.add('hidden');
  document.body.classList.remove('log-open');
  paintLogNew();
  trimLog();
  if (PROMPT.mini && PROMPT.miniBy === 'log') expandPrompt();
  refreshPendingUI();
}

function toast(msg) {
  const t = h('div', 'tst', msg);
  $('#toast').appendChild(t);
  setTimeout(() => t.remove(), 1900);
}

UI.toast = toast;

UI.shake = function (seat) {
  const el = UI.seatEls[seat];
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
};

function floatText(txt, cls) {
  const f = h('div', 'ftext ' + (cls || ''), txt);
  $('#floatText').appendChild(f);
  setTimeout(() => f.remove(), 1600);
}
UI.floatText = floatText;

/* ================= 开局发牌 ================= */

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/* 每张牌飞向哪里：自己 → 手牌区，对手 → 其武将卡 */
function dealTarget(p) {
  if (p.seat === 0) {
    const hand = $('#handArea');
    if (hand) {
      const r = hand.getBoundingClientRect();
      return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
    }
  }
  const seat = UI.seatEls[p.seat];
  if (seat) {
    const gc = seat.querySelector('.gcard') || seat;
    return centerOf(gc);
  }
  return null;
}

function flyDealCard(layer, from, to) {
  const el = h('div', 'deal-fly');
  layer.appendChild(el);
  const at = (x, y) => `translate(${x}px,${y}px) translate(-50%,-50%)`;
  const anim = el.animate([
    { transform: `${at(from.x, from.y)} rotate(-12deg) scale(.9)`, opacity: .9 },
    { transform: `${at((from.x + to.x) / 2, Math.min(from.y, to.y) - 28)} rotate(7deg) scale(1.05)`, opacity: 1, offset: .5 },
    { transform: `${at(to.x, to.y)} rotate(0deg) scale(.62)`, opacity: 0 },
  ], { duration: 430, easing: 'cubic-bezier(.3,.8,.4,1)', fill: 'forwards' });
  anim.onfinish = () => el.remove();
}

/* 起手四张：洗牌 → 从主公起逐张发，牌背飞向各自武将卡。
   opts.skip（快速模式）/ 系统偏好减少动效 时直接发完，不做动画。
   无论哪条路径，手牌都由这里发，调用方不用再 drawCards。 */
UI.dealIntro = async function (opts) {
  opts = opts || {};
  const layer = $('#dealLayer');
  const pile = $('#pileDraw');
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  if (opts.skip || !layer || !pile || reduce) {
    G.players.forEach(p => drawCards(p, 4));
    UI.render();
    return;
  }

  layer.classList.remove('hidden');
  layer.innerHTML = '<div id="dealTitle"></div>';
  layer.style.pointerEvents = 'auto';
  let skipAll = false;
  const skipFn = () => { skipAll = true; };
  layer.addEventListener('pointerdown', skipFn);

  const title = layer.querySelector('#dealTitle');
  const setTitle = t => {
    title.classList.remove('out');
    title.style.animation = 'none';
    title.textContent = t;
    void title.offsetWidth;
    title.style.animation = '';
  };

  const origin = centerOf(pile);
  pile.classList.add('shuffling');
  setTitle('洗 牌');
  await sleep(640);
  pile.classList.remove('shuffling');

  // 从主公开始按座位顺序发，跟真实开局一致
  const lord = G.players.find(p => p.identity === 'lord') || G.players[0];
  const n = G.players.length;
  const order = G.players.slice().sort((a, b) =>
    ((a.seat - lord.seat + n) % n) - ((b.seat - lord.seat + n) % n));

  const total = n * 4;
  const stagger = Math.round(Math.max(82, Math.min(170, 2400 / total)));
  setTitle('发 牌');

  for (let round = 0; round < 4; round++) {
    for (const p of order) {
      const tgt = dealTarget(p) || origin;
      if (!skipAll) {
        flyDealCard(layer, origin, tgt);
        await sleep(stagger);
      }
      drawCards(p, 1);
      UI.render();
      // 落牌的那一下：自己亮最后一张手牌，对手亮手牌数
      const land = p.seat === 0
        ? ($('#handArea') && $('#handArea').lastElementChild)
        : (UI.seatEls[p.seat] && UI.seatEls[p.seat].querySelector('.hand-count'));
      if (land) {
        land.classList.remove('deal-land');
        void land.offsetWidth;
        land.classList.add('deal-land');
      }
    }
    if (!skipAll) await sleep(120);
  }

  await sleep(skipAll ? 60 : 420);
  title.classList.add('out');
  await sleep(skipAll ? 80 : 300);
  layer.removeEventListener('pointerdown', skipFn);
  layer.style.pointerEvents = 'none';
  layer.classList.add('hidden');
  layer.innerHTML = '';
};

/* ================= 结束 ================= */

UI.gameOver = function (camp) {
  const me = G.players[0];
  const winCamps = { lord: ['lord', 'loyal'], rebel: ['rebel'], spy: ['spy'] };
  const win = winCamps[camp].includes(me.identity);

  const rows = `<div class="result-list">${G.players.map(p => `
    <div class="result-row">
      <span>${p.seat === 0 ? '你' : '电脑' + p.seat} · ${p.general}
        ${idBadge(p.identity, { cls: 'sm' })}</span>
      <span style="color:${p.alive ? '#8fe0a8' : '#8a7f6d'}">${p.alive ? `存活 ${p.hp}血` : '阵亡'}</span>
    </div>`).join('')}</div>`;

  UI.resultHtml = `
      <div class="result-title ${win ? 'win' : 'lose'}">${win ? '胜 利' : '败 北'}</div>
      <div class="m-body" style="text-align:center;color:#9c8f78;margin-bottom:14px">
        ${camp === 'lord' ? '主公与忠臣获胜' : camp === 'rebel' ? '反贼获胜' : '内奸获胜'}
      </div>
      ${rows}
      <div class="m-actions result-actions">
        <button class="btn primary" id="mAgain">再来一局</button>
        <button class="btn" id="mLog">查看战报</button>
      </div>
      <button class="result-mini" id="mHide">收起结算，回到牌桌</button>
      <div class="result-note">收起后点屏幕下方「看结算」，随时回来</div>`;

  setTimeout(showResultModal, 700);
};

/* 打开结算面板（也是「收起」之后重新打开的入口） */
function showResultModal() {
  UI.resultMini = false;
  refreshPendingUI();
  openModal(UI.resultHtml, box => {
    const again = box.querySelector('#mAgain');
    const toLog = box.querySelector('#mLog');
    const hide = box.querySelector('#mHide');
    if (again) again.onclick = () => { closeModal(); location.reload(); };
    if (toLog) toLog.onclick = () => hideResult('log');
    if (hide) hide.onclick = () => hideResult('chip');
  });
}

/* 收起结算：面板关掉，留一个随时能回来的入口 */
function hideResult(where) {
  closeModal();
  UI.resultMini = true;
  if (where === 'log') openLog();
  else refreshPendingUI();
}

/* ================= 事件绑定 ================= */

function bindUI() {
  if (bindUI._done) return;
  bindUI._done = true;
  $('#handArea').addEventListener('click', e => {
    const el = e.target.closest('.card');
    if (!el) return;
    const uid = +el.dataset.uid;
    const card = G.players[0].hand.find(c => c.uid === uid);
    if (card) onCardClick(card);
  });

  $('#seats').addEventListener('click', e => {
    const info = e.target.closest('.gc-info');
    if (info) {
      e.stopPropagation();
      const p = G.players.find(x => x.seat === +info.dataset.seat);
      if (p) openGeneralSheet(p);
      return;
    }
    const el = e.target.closest('.seat');
    if (!el) return;
    onSeatClick(+el.dataset.seat);
  });

  $('#btnConfirm').onclick = onConfirm;
  $('#btnCancel').onclick = onCancel;

  // 牌堆 / 弃牌堆：点按即可浏览
  $('#piles').addEventListener('click', e => {
    const el = e.target.closest('.pile');
    if (!el) return;
    openPileSheet(el.id === 'pileDraw' ? 'draw' : 'discard');
  });

  // 图鉴
  $('#btnCodex').onclick = () => openCodex('cards');

  // 操作提示条上的 ⓘ：解释当前上下文
  $('#btnPromptInfo').onclick = () => {
    if (UI.sel.cards.length === 1) { openCardSheet(UI.sel.cards[0]); return; }
    const req = UI.req;
    if (req && req.prompt) {
      const m = /【([^】]+)】/.exec(req.prompt);
      if (m && CARD_ID_BY_NAME[m[1]]) {
        openCardSheet({ id: CARD_ID_BY_NAME[m[1]], suit: 'none', num: 0, uid: -1 });
        return;
      }
    }
    openCodex('rules');
  };

  $('#btnLog').onclick = () => {
    if ($('#logPanel').classList.contains('hidden')) openLog();
    else closeLog();
  };
  $('#btnCloseLog').onclick = closeLog;

  // 战报：滚到底才算「跟随」，否则计数并给手动跳转按钮
  const logList = $('#logList');
  logList.addEventListener('scroll', () => {
    const near = logList.scrollHeight - logList.scrollTop - logList.clientHeight < 26;
    UI.logStick = near;
    if (near) { if (UI.logUnread) { UI.logUnread = 0; paintLogNew(); } trimLog(); }
  });
  $('#logNew').onclick = () => {
    UI.logStick = true;
    UI.logUnread = 0;
    paintLogNew();
    trimLog();
    logList.scrollTop = logList.scrollHeight;
  };
  // 战报底栏：关战报 → 展开提示卡
  $('#logPending').onclick = () => { closeLog(); if (PROMPT.mini) expandPrompt(); };
  // 悬浮胶囊：展开提示卡
  $('#promptChip').onclick = () => expandPrompt();

  // 结算收起后：胶囊 / 战报底栏都能回到结算
  $('#resultChip').onclick = () => showResultModal();
  $('#logResult').onclick = () => { closeLog(); showResultModal(); };

  $('#btnMenu').onclick = () => {
    openModal(`
      <div class="m-title">菜 单</div>
      <div class="m-actions" style="flex-direction:column;gap:10px">
        <button class="btn" id="mRule" style="width:100%">规则与图鉴</button>
        <button class="btn" id="mGuide" style="width:100%">新手指南</button>
        <button class="btn" id="mRestart" style="width:100%">重新开始</button>
        <button class="btn ghost" id="mClose" style="width:100%">继续游戏</button>
      </div>`);
    $('#mClose').onclick = () => closeModal();
    $('#mRestart').onclick = () => location.reload();
    $('#mRule').onclick = () => { closeModal(); openCodex('rules'); };
    $('#mGuide').onclick = () => { closeModal(); showGuide(); };
  };

  let _rzTimer = 0;
  window.addEventListener('resize', () => {
    UI.render();
    if (PROMPT.mini || $('#modal').classList.contains('prompt')) computePromptBottom();
    // 旋转/进出全屏后浏览器还会再发一次 resize（安全区、可用高度变化），
    // 补一次重排，座位表与身份印章才不会停在旧坐标上
    clearTimeout(_rzTimer);
    _rzTimer = setTimeout(() => {
      UI.render();
      if (PROMPT.mini || $('#modal').classList.contains('prompt')) computePromptBottom();
      layoutIdMarks();
    }, 220);
  });
}

/* 新手指南：三步上手 */
function showGuide() {
  openModal(`
    <div class="m-title">新 手 指 南</div>
    <div class="m-body guide-body">
      <div class="guide-step">
        <span class="gs-n">1</span>
        <div><b>看懂局面</b><br>
        上方是其他角色（点 ⓘ 看他们的技能），中央显示当前回合者与阶段，
        下方是你的武将牌、装备区与手牌。</div>
      </div>
      <div class="guide-step">
        <span class="gs-n">2</span>
        <div><b>出牌</b><br>
        点手牌选中 → 点对手（或自己）作目标 → 点【使用】。
        不想出牌就点【结束出牌】。灰色牌表示此刻用不了，<b>长按</b>可看原因。</div>
      </div>
      <div class="guide-step">
        <span class="gs-n">3</span>
        <div><b>随时查说明</b><br>
        长按任意手牌 / 武将卡 / 判定牌可看详细效果；<b>点按</b>行动横幅里的牌、横幅与战报里的武将名，
        也能直接打开详情（中央的牌和回合名同样可点）；右上角「册」是图鉴。</div>
      </div>
      <div class="guide-tip">提示：攻击范围外的角色会标出「距 N ✕」，点它会告诉你为什么不能选。</div>
    </div>
    <div class="m-actions">
      <button class="btn primary" id="mGuideOk">开始游戏</button>
    </div>`, box => {
    box.querySelector('#mGuideOk').onclick = () => closeModal();
  });
}

function showRule() {
  openModal(`
    <div class="m-title">游戏规则</div>
    <div class="m-body" style="font-size:12.5px;line-height:1.9">
      <p><b style="color:#c8a95c">身份</b><br>
      主公：击杀所有反贼与内奸。<br>
      忠臣：保护主公，胜利条件同主公。<br>
      反贼：击杀主公即胜。<br>
      内奸：先助主公除掉反贼，最后与主公单挑获胜。</p>
      <p><b style="color:#c8a95c">流程</b><br>
      准备 → 判定 → 摸牌（2张）→ 出牌 → 弃牌（手牌上限＝当前体力）→ 结束</p>
      <p><b style="color:#c8a95c">操作</b><br>
      点击手牌选中，再点击目标，按【使用】确认。<br>
      技能按钮在出牌阶段显示于手牌上方。<br>
      有转化技（武圣/龙胆/倾国等）时，选牌后会出现「当【杀】使用」按钮。</p>
      <p><b style="color:#c8a95c">距离</b><br>
      默认攻击范围1，装备武器可增加；每名角色到相邻角色的距离为1，-1马减少你计算的距离，+1马增加别人计算你的距离。</p>
    </div>
    <div class="m-actions"><button class="btn primary" id="mRuleOk">明白了</button></div>`, box => {
    box.querySelector('#mRuleOk').onclick = () => closeModal();
  });
}
