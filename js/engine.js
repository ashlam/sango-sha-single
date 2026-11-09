'use strict';
/* ============================================================
 *  三国杀 · 单机版   —— 游戏引擎（纯逻辑，不依赖 DOM）
 * ============================================================ */

const G = {
  players: [],
  deck: [],
  discard: [],
  current: 0,
  turn: 0,
  phase: '',
  over: false,
  result: null,
  responder: null,      // (player, request) => Promise<response>
  log: [],
  processing: null,     // 当前正在结算的牌（供 UI 显示）
  busy: false,
  chaining: false,
  speed: 1,
  guess: {},            // 玩家对他人身份的猜测（纯笔记，不参与结算）：{ seat: 'rebel' }
};

let UID = 1;

/* ================= 基础工具 ================= */

function log(text, cls) {
  G.log.push({ text, cls: cls || '', t: Date.now() });
  if (G.log.length > 200) G.log.shift();
  if (typeof UI !== 'undefined' && UI.onLog) UI.onLog(G.log[G.log.length - 1]);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hasSkill(p, id) { return p && p.skills && p.skills.indexOf(id) >= 0; }

function cardName(c) { return c ? (CARD_INFO[c.id] ? CARD_INFO[c.id].name : c.id) : '?'; }
function cardText(c) { return c ? `${SUIT_SYM[c.suit]}${numText(c.num)}·${cardName(c)}` : '?'; }

function makeCard(def) {
  return { uid: UID++, id: def.id, suit: def.suit, num: def.num, name: CARD_INFO[def.id].name };
}
function makeVirtual(id) {
  const info = CARD_INFO[id];
  return { uid: UID++, id, suit: 'none', num: 0, name: info.name, virtual: true };
}

/* ================= 初始化 ================= */

function newGame(cfg) {
  cfg = cfg || {};
  G.players = [];
  G.deck = [];
  G.discard = [];
  G.log = [];
  G.turn = 0;
  G.over = false;
  G.result = null;
  G.current = 0;
  G.processing = null;
  G.chaining = false;
  G.guess = {};

  const count = cfg.playerCount || 4;
  const ids = IDENTITY_SETUP[count].slice();

  // 玩家永远坐 0 号位（界面上永远在底部）
  const myIdentity = cfg.playerIdentity || ids[Math.floor(Math.random() * ids.length)];
  const rest = ids.slice();
  rest.splice(rest.indexOf(myIdentity), 1);

  // 其余身份完全随机落座
  const shuffledRest = shuffle(rest);

  for (let i = 0; i < count; i++) {
    const p = {
      seat: i,
      name: '',
      identity: '',
      generalId: '',
      general: '',
      kingdom: '',
      sex: 'm',
      hp: 4, maxHp: 4,
      hand: [],
      equip: { weapon: null, armor: null, horseMinus: null, horsePlus: null },
      judgeZone: [],
      skills: [],
      alive: true,
      isAI: i !== 0,
      flags: {},
      marks: {},
      shaCount: 0,
      flipped: false,
    };
    G.players.push(p);
  }

  // 分配身份
  let ri = 0;
  for (let i = 1; i < count; i++) {
    G.players[i].identity = shuffledRest[ri++];
  }
  G.players[0].identity = myIdentity;
  // 主公的座位完全不固定：玩家不是主公时也不强塞到 1 号位。
  // 否则「玩家恒为主公上家」这件事本身就是一条泄露信息的规律，
  // 连续开局时下家的身份也能被猜到。主公仍然先手（由启动流程决定起手座位）。

  G.myIndex = 0;
  G.config = cfg;
  return G;
}

/* 选将：给玩家 3 个候选，其余角色随机 */
function pickGeneralPool(n, exclude) {
  const pool = GENERALS.filter(g => !exclude.includes(g.id));
  shuffle(pool);
  return pool.slice(0, n);
}

/* ================= 座位 / 距离 ================= */

function alivePlayers() { return G.players.filter(p => p.alive); }

function seatOrder(from, includeSelf) {
  const n = G.players.length, res = [];
  if (includeSelf === undefined) includeSelf = true;
  for (let i = 0; i < n; i++) {
    if (i === 0 && !includeSelf) continue;
    const p = G.players[(from.seat + i) % n];
    if (p.alive) res.push(p);
  }
  return res;
}

function nextAlive(from) {
  const n = G.players.length;
  for (let i = 1; i <= n; i++) {
    const p = G.players[(from.seat + i) % n];
    if (p.alive) return p;
  }
  return null;
}

function distance(a, b) {
  if (a === b) return 0;
  if (!a.alive || !b.alive) return 99;
  const n = G.players.length;
  let d1 = 0, k = a.seat;
  while (k !== b.seat) { k = (k + 1) % n; if (G.players[k].alive) d1++; }
  let d2 = 0; k = a.seat;
  while (k !== b.seat) { k = (k - 1 + n) % n; if (G.players[k].alive) d2++; }
  let d = Math.min(d1, d2);
  if (b.equip.horsePlus) d += 1;
  if (a.equip.horseMinus) d -= 1;
  if (hasSkill(a, 'mashu')) d -= 1;
  return Math.max(1, d);
}

function attackRange(p) {
  const w = p.equip.weapon;
  return w ? (CARD_INFO[w.id].range || 1) : 1;
}

function inAttackRange(a, b) { return distance(a, b) <= attackRange(a); }

/* ================= 牌堆操作 ================= */

function buildDeck() {
  G.deck = shuffle(FULL_DECK.map(makeCard));
  G.discard = [];
}

function drawOne() {
  if (G.deck.length === 0) {
    if (G.discard.length === 0) return null;
    G.deck = shuffle(G.discard);
    G.discard = [];
    log('牌堆已空，弃牌堆洗回牌堆', 'dim');
  }
  return G.deck.pop();
}

function drawCards(p, n) {
  const got = [];
  for (let i = 0; i < n; i++) {
    const c = drawOne();
    if (c) { p.hand.push(c); got.push(c); }
  }
  return got;
}

function toDiscard(cards) {
  if (!cards) return;
  // 被「奸雄」之类技能收走的牌会打上 _taken 标记，避免同时进入弃牌堆
  const arr = Array.isArray(cards) ? cards : [cards];
  arr.forEach(c => { if (c && !c.virtual && !c._taken) G.discard.push(c); });
}

function takeFromHand(p, card) {
  const i = p.hand.findIndex(c => c.uid === card.uid);
  if (i < 0) return false;
  p.hand.splice(i, 1);
  // 连营：失去最后一张手牌摸一张
  if (p.hand.length === 0 && hasSkill(p, 'lianying') && p.alive) {
    log(`${p.name} 发动【连营】`, 'skill');
    drawCards(p, 1);
  }
  return true;
}

function removeCardAnywhere(p, card) {
  // 从手牌或装备区移除（不触发弃牌）
  if (takeFromHand(p, card)) return true;
  for (const k in p.equip) {
    if (p.equip[k] && p.equip[k].uid === card.uid) {
      const lost = p.equip[k];
      p.equip[k] = null;
      onLoseEquip(p, lost);
      return true;
    }
  }
  return false;
}

function onLoseEquip(p, card) {
  if (!p.alive) return;
  if (hasSkill(p, 'xiaoji')) {
    log(`${p.name} 发动【枭姬】摸两张牌`, 'skill');
    drawCards(p, 2);
  }
  if (card.id === 'baiyin' && p.hp < p.maxHp) {
    heal(p, 1);
    log(`${p.name} 失去【白银狮子】回复1点体力`, 'skill');
  }
}

function discardCards(p, cards, opt) {
  const arr = Array.isArray(cards) ? cards : [cards];
  arr.forEach(c => { if (c) removeCardAnywhere(p, c); });
  toDiscard(arr);
  // 战报要能看到「具体弃了哪几张」，而不只是「弃置 2 张牌」。
  // 带花色的牌名会被 logHtml 自动变成可点词条，点开就是这张牌的详情。
  const gone = arr.filter(c => c && !c.virtual && !c._taken);
  if (gone.length && !(opt && opt.silent)) {
    log(`${p.name} 弃置 ${gone.map(cardText).join('、')}`, 'dim');
  }
  return gone;
}

function gainCards(p, cards, from) {
  const arr = (Array.isArray(cards) ? cards : [cards]).filter(Boolean);
  arr.forEach(c => {
    if (from) removeCardAnywhere(from, c);
    p.hand.push(c);
  });
  return arr;
}

function cardsOf(p) {
  const out = p.hand.slice();
  for (const k in p.equip) if (p.equip[k]) out.push(p.equip[k]);
  return out;
}

/* ================= 展示节拍 =================
 * 引擎在每个关键动作后调用 beat()，UI 层可以借此暂停展示
 * （横幅、动画）。Node 模拟 / auto 模式下 G.beat 未定义则直接跳过。 */
async function beat(ev, d) {
  if (typeof G.beat === 'function') {
    try { await G.beat(ev, d || {}); } catch (e) { /* 展示失败不影响对局 */ }
  }
}

/* ================= 询问 ================= */

function ask(p, req) {
  if (!p || !p.alive) return Promise.resolve(null);
  req.player = p;
  if (!G.responder) return Promise.resolve(null);
  return Promise.resolve(G.responder(p, req)).then(r => {
    // 救人（save）另有专门的 beat：那边知道「谁救了谁、回了多少体力」
    if (r && r.card && req.kind !== 'save') beat('card', { player: p, card: r.card, respond: true, kind: req.kind });
    return r;
  }).catch(e => { console.error(e); return null; });
}

async function confirm(p, prompt, skillId) {
  const r = await ask(p, { kind: 'yesno', prompt, skill: skillId });
  return !!(r && r.yes);
}

/* ================= 判定 ================= */

async function judge(p, reason) {
  let card = drawOne();
  if (!card) return null;
  log(`${p.name} 判定：${cardText(card)}`, 'judge');
  G.processing = card;
  if (typeof UI !== 'undefined') UI.render();
  await beat('card', { player: p, card, judge: true });

  // 鬼才等改判技能（从当前回合角色开始的座次）
  const order = G.players[G.current] ? seatOrder(G.players[G.current]) : alivePlayers();
  for (const q of order) {
    if (!q.alive) continue;
    for (const sid of q.skills) {
      const sk = SKILLS[sid];
      if (sk && sk.modifyJudge) {
        const newCard = await sk.modifyJudge(q, { card, target: p, reason });
        if (newCard) {
          toDiscard(card);
          card = newCard;
          log(`${q.name} 发动【${sk.name}】，判定改为 ${cardText(card)}`, 'skill');
          if (typeof UI !== 'undefined') UI.render();
        }
      }
    }
  }

  await fire('afterJudge', p, { card, reason });
  // 「其他角色判定后」的技能（如颂威）
  for (const q of alivePlayers()) {
    if (q !== p) await fire('afterOtherJudge', q, { card, reason, target: p });
  }
  G.processing = null;
  return card;
}

/* 简单判定（无改判，用于八卦等） */
async function judgeQuick(p, reason) {
  return judge(p, reason);
}

/* ================= 技能触发 ================= */

async function fire(event, p, ctx) {
  if (!p) return;
  // 只有「死亡」事件需要在角色已经阵亡后仍触发（行殇等）
  if (!p.alive && event !== 'onDeath') return;
  ctx = ctx || {};
  for (const sid of p.skills.slice()) {
    const sk = SKILLS[sid];
    if (sk && typeof sk[event] === 'function') {
      try { await sk[event](p, ctx); } catch (e) { console.error('skill err', sid, e); }
    }
  }
}

/* ================= 体力 / 伤害 ================= */

function loseHp(p, n) {
  if (!p.alive) return;
  p.hp = Math.max(0, p.hp - n);
  log(`${p.name} 失去 ${n} 点体力`, 'dmg');
  if (typeof UI !== 'undefined') UI.render();
  if (typeof window !== 'undefined' && window.FX) window.FX.hit(p.seat, '-' + n, 'dmg');
}

async function heal(p, n, source) {
  if (!p.alive) return 0;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  const real = p.hp - before;
  if (real > 0) log(`${p.name} 回复 ${real} 点体力`, 'heal');
  if (typeof UI !== 'undefined') UI.render();
  if (real > 0) await beat('heal', { target: p, amount: real, source });
  return real;
}

async function damage(source, target, amount, card, nature) {
  if (!target || !target.alive || amount <= 0) return 0;

  // 白银狮子：至多受到1点伤害
  if (target.equip.armor && target.equip.armor.id === 'baiyin' && amount > 1) {
    amount = 1;
  }
  // 藤甲：火焰伤害+1
  if (target.equip.armor && target.equip.armor.id === 'tengjia' && nature === 'fire') {
    amount += 1;
    log('【藤甲】被火焰引燃，伤害+1', 'skill');
  }

  target.hp -= amount;
  log(`${target.name} 受到 ${amount} 点${nature === 'fire' ? '火' : nature === 'thunder' ? '雷' : ''}伤害（来自 ${source ? source.name : '无'}）`, 'dmg');
  await beat('dmg', { target, source, amount, nature });
  if (typeof UI !== 'undefined') { UI.render(); UI.shake(target.seat); }

  // 铁索连环：只有属性伤害（火 / 雷）才传导，普通伤害不传导
  // 规则：横置角色受到属性伤害后须重置，再令其余横置角色依次受到等量同属性伤害
  if (nature && target.flags.chained) {
    target.flags.chained = false;
    log(`${target.name} 受到属性伤害，重置`, 'dim');
    if (typeof UI !== 'undefined') UI.render();

    if (!G.chaining) {
      G.chaining = true;
      try {
        const others = alivePlayers().filter(p => p !== target && p.flags.chained);
        for (const o of others) {
          if (!o.alive) continue;
          log(`【铁索连环】传导至 ${o.name}`, 'skill');
          await damage(source, o, amount, card, nature);
        }
      } finally {
        G.chaining = false;
      }
    }
  }

  await fire('afterDamage', target, { source, amount, card, nature });

  if (target.hp <= 0) await dying(target, source);
  return amount;
}

/* ================= 濒死 ================= */

async function dying(p, source) {
  if (p.dying) return;
  if (p.hp > 0) return;
  p.dying = true;
  log(`${p.name} 濒死！`, 'dying');
  if (typeof UI !== 'undefined') UI.render();
  await beat('dying', { player: p, source });

  const order = seatOrder(p);
  let guard = 0;
  while (p.hp <= 0 && p.alive && guard++ < 30) {
    let used = false;
    for (const q of order) {
      if (!q.alive) continue;
      if (!canSave(q, p)) continue;
      let inner = 0;
      while (p.hp <= 0 && inner++ < 10) {
        const r = await ask(q, {
          kind: 'save',
          target: p,
          prompt: `${p.name} 濒死（体力 ${p.hp}），是否使用【桃】`
            + (q === p && q.hand.some(c => c.id === 'jiu') ? '／【酒】' : '')
            + '救援？',
          valid: c => canSaveWith(q, p, c),
        });
        if (!r) break;
        // 真正把牌打出来；没打出牌就不能算「已救」，否则会原地打转
        const okUse = await useTaoFor(q, p, r);
        if (!okUse) break;
        used = true;
        if (p.hp > 0) break;
      }
      if (p.hp > 0) break;
    }
    if (!used) break;
  }

  p.dying = false;
  if (p.hp <= 0 && p.alive) await die(p, source);
}

function canSave(q, p) {
  if (q === p) {
    if (q.hand.some(c => c.id === 'tao')) return true;
    // 【酒】自救：濒死时的使用不属于出牌阶段，不受「每回合限一次」与回合归属限制
    if (q.hand.some(c => c.id === 'jiu')) return true;
    // 急救是「回合外」技能，濒死发生在别人的回合里时对自己也生效
    if (hasSkill(q, 'jijiu') && G.players[G.current] !== q && q.hand.some(c => isRed(c))) return true;
    return false;
  }
  // 完杀：贾诩回合内其他人不能用桃
  if (hasSkill(G.players[G.current], 'wansha') && G.players[G.current] !== p && G.players[G.current] !== q) return false;
  if (q.hand.some(c => c.id === 'tao')) return true;
  if (hasSkill(q, 'jijiu') && q.hand.some(c => isRed(c)) && G.players[G.current] !== q) return true;
  return false;
}

/* 濒死时这张牌能不能用来救人（canSave 与可选牌必须用同一份判断，
   否则会出现「提示可以救，但一张牌都点不了」的死锁） */
function canSaveWith(q, p, c) {
  if (!c) return false;
  if (c.id === 'tao') return true;
  if (c.id === 'jiu') return q === p;   // 濒死自救，任何时候都能用
  if (hasSkill(q, 'jijiu')) return G.players[G.current] !== q && isRed(c) && !c.virtual;
  return false;
}

async function useTaoFor(q, p, preset) {
  // 通常濒死请求里已经选好了牌（r.card），不必让玩家再选一次
  let card = preset && preset.card && q.hand.some(c => c.uid === preset.card.uid) ? preset.card : null;
  if (!card) {
    const r = await ask(q, {
      kind: 'respond',
      prompt: `对 ${p.name} 使用【桃】${q === p ? '／【酒】' : ''}`,
      valid: c => canSaveWith(q, p, c),
      cancelable: false,
      forced: true,
    });
    if (!r || !r.card) return false;
    card = r.card;
  }
  if (!takeFromHand(q, card)) return false;   // 牌不在手里（已被消耗）→ 视为未救
  toDiscard(card);
  G.processing = card;
  if (typeof UI !== 'undefined') UI.render();
  log(`${q.name} 使用 ${cardText(card)} 救 ${p.name}`, 'heal');
  let amount = 1;
  if (q !== p && hasSkill(p, 'jiuyuan') && q.kingdom === 'wu') {
    amount = 2;
    log(`【救援】${q.name} 是吴势力，${p.name} 额外回复 1 点体力`, 'skill');
  }
  await beat('save', { savior: q, target: p, card, amount });
  await heal(p, amount, q);
  G.processing = null;
  return true;
}

/* ================= 死亡 ================= */

async function die(p, source) {
  p.alive = false;
  p.hp = 0;
  log(`${p.name} 阵亡（${IDENTITY_CN[p.identity]}）`, 'death');
  if (typeof UI !== 'undefined') UI.render();
  await beat('death', { player: p, source });

  // 死亡事件：通知所有存活角色（行殇等技能看的是「其他人」）
  for (const q of alivePlayers()) {
    if (q !== p) await fire('onDeath', q, { player: p, source });
  }

  // 弃置所有牌
  const all = cardsOf(p);
  p.hand = [];
  for (const k in p.equip) p.equip[k] = null;
  p.judgeZone.forEach(c => toDiscard(c));
  p.judgeZone = [];
  toDiscard(all);

  // 身份奖惩
  if (source && source.alive && source !== p) {
    if (p.identity === 'rebel') {
      log(`${source.name} 击杀反贼，摸三张牌`, 'good');
      drawCards(source, 3);
    } else if (p.identity === 'loyal' && source.identity === 'lord') {
      log(`主公误杀忠臣，弃置所有牌`, 'bad');
      const s = cardsOf(source);
      source.hand = [];
      for (const k in source.equip) source.equip[k] = null;
      toDiscard(s);
    }
  }

  checkWin();
}

function checkWin() {
  if (G.over) return;
  const lord = G.players.find(p => p.identity === 'lord');
  const alive = alivePlayers();

  if (lord && !lord.alive) {
    const spies = alive.filter(p => p.identity === 'spy');
    const rebels = alive.filter(p => p.identity === 'rebel');
    if (spies.length === 1 && alive.length === 1) endGame('spy');
    else endGame('rebel');
    return;
  }
  if (lord && lord.alive && alive.every(p => p.identity === 'lord' || p.identity === 'loyal')) {
    endGame('lord');
  }
}

function endGame(camp) {
  G.over = true;
  G.result = camp;
  const texts = { lord: '主公与忠臣获胜', rebel: '反贼获胜', spy: '内奸获胜' };
  log(`游戏结束 —— ${texts[camp]}`, 'end');
  if (typeof window !== 'undefined' && window.UI) window.UI.gameOver(camp);
}

/* ================= 手牌上限 ================= */

function handLimit(p) {
  let n = p.hp;
  if (n < 0) n = 0;
  return n;
}

/* ================= 主循环 ================= */

async function gameLoop() {
  let guard = 0;
  while (!G.over && guard++ < 2000) {
    const p = G.players[G.current];
    if (p && p.alive) await runTurn(p);
    if (G.over) break;
    G.current = (G.current + 1) % G.players.length;
  }
}

async function runTurn(p) {
  G.turn++;
  log(`—— 第 ${G.turn} 回合 · ${p.name} ——`, 'turn');
  if (typeof UI !== 'undefined') UI.render();
  await beat('turn', { player: p, turn: G.turn });

  if (p.flipped) {
    p.flipped = false;
    log(`${p.name} 武将牌翻面，跳过本回合`, 'dim');
    if (typeof UI !== 'undefined') UI.render();
    return;
  }

  p.shaCount = 0;
  p.jiuUsed = false;
  p.wineBonus = 0;
  p.usedActive = {};
  p.usedCardThisTurn = 0;
  // 克己：本回合是否用过 / 打出过【杀】（每回合开始清零）
  p.flags.usedSha = false;

  await fire('turnStart', p, {});
  if (!p.alive || G.over) return;

  /* --- 准备阶段 --- */
  G.phase = 'prepare';
  if (typeof UI !== 'undefined') UI.render();
  await beat('phase', { player: p, phase: 'prepare' });
  await fire('preparePhase', p, {});
  if (!p.alive || G.over) return;

  /* --- 判定阶段 --- */
  G.phase = 'judge';
  if (typeof UI !== 'undefined') UI.render();
  await beat('phase', { player: p, phase: 'judge' });
  await judgePhase(p);
  if (!p.alive || G.over) return;

  /* --- 摸牌阶段 --- */
  G.phase = 'draw';
  if (typeof UI !== 'undefined') UI.render();
  await beat('phase', { player: p, phase: 'draw' });
  await drawPhase(p);
  if (!p.alive || G.over) return;

  /* --- 出牌阶段 --- */
  G.phase = 'play';
  if (typeof UI !== 'undefined') UI.render();
  await beat('phase', { player: p, phase: 'play' });
  await playPhase(p);
  if (!p.alive || G.over) return;

  /* --- 弃牌阶段 --- */
  G.phase = 'discard';
  if (typeof UI !== 'undefined') UI.render();
  await beat('phase', { player: p, phase: 'discard' });
  await discardPhase(p);
  if (!p.alive || G.over) return;

  /* --- 结束阶段 --- */
  G.phase = 'end';
  if (typeof UI !== 'undefined') UI.render();
  await fire('turnEnd', p, {});

  G.phase = '';
}

async function judgePhase(p) {
  // 判定区从后往前结算
  while (p.judgeZone.length > 0 && p.alive) {
    const card = p.judgeZone.pop();
    log(`${p.name} 判定区：${cardName(card)}`, 'judge');
    if (card.id === 'lebu') {
      const j = await judge(p, 'lebu');
      toDiscard(card);
      if (j && j.suit !== 'h') {
        p.flags.skipPlay = true;
        log(`${p.name} 被【乐不思蜀】跳过出牌阶段`, 'bad');
      }
    } else if (card.id === 'bingliang') {
      const j = await judge(p, 'bingliang');
      toDiscard(card);
      if (j && j.suit !== 'c') {
        p.flags.skipDraw = true;
        log(`${p.name} 被【兵粮寸断】跳过摸牌阶段`, 'bad');
      }
    } else if (card.id === 'shandian') {
      const j = await judge(p, 'shandian');
      if (j && j.suit === 's' && j.num >= 2 && j.num <= 9) {
        toDiscard(card);
        log(`【闪电】击中 ${p.name}！`, 'bad');
        await damage(null, p, 3, card, 'thunder');
      } else {
        // 移到下家判定区
        const nxt = nextAlive(p);
        if (nxt) {
          nxt.judgeZone.push(card);
          log(`【闪电】移动到 ${nxt.name} 的判定区`, 'dim');
        } else toDiscard(card);
      }
    } else {
      toDiscard(card);
    }
    if (typeof UI !== 'undefined') UI.render();
  }
}

async function drawPhase(p) {
  let n = 2;
  // 技能修改摸牌数
  for (const sid of p.skills) {
    const sk = SKILLS[sid];
    if (sk && sk.modifyDraw) {
      const r = await sk.modifyDraw(p, { n });
      if (r !== undefined && r !== null) n = r;
    }
  }
  if (p.flags.skipDraw) {
    p.flags.skipDraw = false;
    log(`${p.name} 跳过摸牌阶段`, 'dim');
    return;
  }
  if (n > 0) {
    drawCards(p, n);
    log(`${p.name} 摸 ${n} 张牌`, 'dim');
  }
  if (typeof UI !== 'undefined') UI.render();
}

async function playPhase(p) {
  if (p.flags.skipPlay) {
    p.flags.skipPlay = false;
    log(`${p.name} 跳过出牌阶段`, 'dim');
    return;
  }

  let guard = 0, idle = 0;
  const idleLimit = p.isAI ? 3 : 100;
  while (p.alive && !G.over && guard++ < 100) {
    if (typeof UI !== 'undefined') UI.render();
    const r = await ask(p, { kind: 'play', options: playOptions(p) });
    if (!r || r.action === 'end') break;
    let ok = true;
    if (r.action === 'use') {
      ok = await useCard(p, r.card, r.targets || [], { asId: r.asId, extraCards: r.extraCards });
    } else if (r.action === 'skill') {
      ok = await useActiveSkill(p, r.id, r);
    } else if (r.action === 'recast') {
      ok = await recastCard(p, r.card);
    }
    // 兜底：动作被拒绝时不能无限重试（AI 决策与校验不一致会卡在这里空转）
    if (ok === false) {
      if (++idle >= idleLimit) {
        log(`${p.name} 没有可执行的动作，结束出牌阶段`, 'dim');
        break;
      }
    } else {
      idle = 0;
    }
  }
}

/* 出牌阶段可用主动技 */
function playOptions(p) {
  const out = [];
  for (const sid of p.skills) {
    const sk = SKILLS[sid];
    if (sk && sk.active && !(p.usedActive && p.usedActive[sid])) {
      out.push({ id: sid, name: sk.name, desc: sk.desc, cost: sk.cost || '' });
    }
  }
  return out;
}

async function useActiveSkill(p, sid) {
  const sk = SKILLS[sid];
  if (!sk || !sk.active) return false;
  if (sk.limit && p.usedActive[sid]) { log('本阶段已使用过该技能', 'dim'); return false; }
  if (sk.once && p.marks[sid]) { log('该限定技已经使用过', 'dim'); return false; }
  const ok = await sk.active(p);
  if (ok && sk.limit) p.usedActive[sid] = true;
  return !!ok;
}

async function discardPhase(p) {
  const limit = handLimit(p);
  if (p.hand.length <= limit) return;          // 本来就不用弃牌，不必打扰
  if (hasSkill(p, 'keji') && !p.flags.usedSha) {
    const yes = await confirm(p, '是否发动【克己】跳过弃牌阶段？', 'keji');
    if (yes) { log(`${p.name} 发动【克己】跳过弃牌阶段`, 'skill'); return; }
  }
  const need = p.hand.length - limit;
  const r = await ask(p, {
    kind: 'discard',
    min: need, max: need,
    title: '弃牌',
    limit,
    cancelable: false,                // 手牌超限必须弃，不能点取消赖掉
    prompt: `请弃置 ${need} 张手牌（手牌上限 ${limit}）`,
  });
  const cards = (r && r.cards) || [];
  discardCards(p, cards);        // 具体弃了哪几张由 discardCards 统一写进战报
  if (typeof UI !== 'undefined') UI.render();
}

/* ================= 使用牌 ================= */

function isTrick(id) { const i = CARD_INFO[id]; return i && i.type === 'trick'; }
function isDelay(id) { const i = CARD_INFO[id]; return i && i.delay; }
function isEquip(id) { const i = CARD_INFO[id]; return i && i.type === 'equip'; }
function isBasic(id) { const i = CARD_INFO[id]; return i && i.type === 'basic'; }
function isShaId(id) { const i = CARD_INFO[id]; return i && i.keyword === '杀'; }

/* ------------------------------------------------------------
 * 「这张牌能不能当作【杀】/【闪】使用或打出」
 * 转化技（武圣 / 龙胆 / 倾国）分散在出牌、响应、拼点、借刀、青龙等多个入口，
 * 以前每处各写一份判断，漏一处就会出现「手里有闪当不了杀」。
 * 现在统一走这两个函数，新增响应点时不要再手写条件。
 * ---------------------------------------------------------- */
function asShaId(p, c) {
  if (!c) return null;
  if (isShaId(c.id)) return c.id;
  if (hasSkill(p, 'longdan') && c.id === 'shan') return 'sha';          // 龙胆：闪 → 杀
  if (hasSkill(p, 'wusheng') && isRed(c) && !c.virtual) return 'sha';   // 武圣：红牌 → 杀
  return null;
}
function canAsSha(p, c) { return !!asShaId(p, c); }

function asShanId(p, c) {
  if (!c) return null;
  if (c.id === 'shan') return 'shan';
  if (hasSkill(p, 'qingguo') && isBlack(c) && !c.virtual) return 'shan'; // 倾国：黑牌 → 闪
  if (hasSkill(p, 'longdan') && c.id === 'sha') return 'shan';           // 龙胆：杀 → 闪
  return null;
}

/* ------------------------------------------------------------
 * 装备带来的「视为」能力（与武将转化技分开，因为它们挂在武器上）
 * ---------------------------------------------------------- */

/* 朱雀羽扇：普通【杀】可当火【杀】使用 */
function canAsFireSha(p, card) {
  return !!(p && p.equip && p.equip.weapon && p.equip.weapon.id === 'zhuque'
    && card && card.id === 'sha');
}

/* 丈八蛇矛：两张手牌当一张【杀】（使用或打出都要手上有两张） */
function canZhangba(p) {
  return !!(p && p.alive && p.equip && p.equip.weapon
    && p.equip.weapon.id === 'zhangba' && p.hand.length >= 2);
}

/* 询问要出的【杀】牌组（只选牌，不移动）：
 * 普通情况返回 1 张，装备丈八蛇矛时玩家也可以选 2 张。
 * target 传入时只允许「打得到这个目标」的牌——花色/属性会影响仁王盾与藤甲，
 * 否则 AI 会挑一张打不中的牌，被引擎拒绝后空转。
 * 使用（借刀 / 青龙 / 乱武）交给 useCard，打出（南蛮 / 决斗）交给 playShaCards。 */
async function pickShaCards(p, prompt, target) {
  const zb = canZhangba(p);
  const hittable = c => !target || validTargets(p, asShaId(p, c) || c.id, c).includes(target);
  const r = await ask(p, {
    kind: 'respond',
    prompt,
    asId: 'sha',
    valid: c => canAsSha(p, c) && hittable(c),
    zhangba: zb,                       // UI 据此允许多选一张
    cancelable: true,
  });
  if (!r) return null;
  if (r.cards && r.cards.length === 2) {
    if (!zb) return null;
    const a = r.cards[0], b = r.cards[1];
    if (!a || !b || a.uid === b.uid) return null;
    if (!p.hand.includes(a) || !p.hand.includes(b)) return null;
    if (target && !validTargets(p, 'sha', a).includes(target)) return null;
    return { cards: [a, b] };
  }
  if (!r.card) return null;
  if (!hittable(r.card)) return null;
  return { cards: [r.card] };
}

/* 把 pickShaCards 的结果变成 useCard 的参数 */
function shaUseOpts(p, pk) {
  const extra = pk.cards.slice(1);
  return { asId: extra.length ? 'sha' : (asShaId(p, pk.cards[0]) || pk.cards[0].id), extraCards: extra };
}

/* p 手上有没有一张（或丈八的两张）能打到 t 的【杀】。
 * 注意别再用 makeVirtual('sha') 判断：虚拟牌没有花色，
 * 仁王盾会误判为可用，AI 提交后又被引擎拒绝（空转）。 */
function canShaTarget(p, t) {
  if (!t || !t.alive) return false;
  for (const c of p.hand) {
    const asId = asShaId(p, c);
    if (asId && validTargets(p, asId, c).includes(t)) return true;
  }
  if (canZhangba(p)) {
    return p.hand.some(c => validTargets(p, 'sha', c).includes(t));
  }
  return false;
}

/* 打出一组【杀】牌（南蛮 / 决斗等「打出」场合），返回是否打出 */
async function playShaCards(p, prompt) {
  const pk = await pickShaCards(p, prompt);
  if (!pk) return false;
  for (const c of pk.cards) { takeFromHand(p, c); toDiscard(c); }
  if (pk.cards.length === 2) log(`${p.name} 发动【丈八蛇矛】，将两张牌当【杀】打出`, 'skill');
  else log(`${p.name} 打出【杀】`, 'respond');
  markShaUsed(p);
  if (typeof UI !== 'undefined') UI.render();
  return true;
}
function canAsShan(p, c) { return !!asShanId(p, c); }

function natureOf(id) { const i = CARD_INFO[id]; return i && i.nature ? i.nature : null; }

/* 目标合法性 */
function validTargets(user, asId, card) {
  const info = CARD_INFO[asId];
  const res = [];
  // 奇才：使用锦囊牌无距离限制
  const noDist = hasSkill(user, 'qicai');
  for (const p of alivePlayers()) {
    let ok = true;
    if (asId === 'sha' || asId === 'huosha' || asId === 'leisha') {
      if (p === user) ok = false;
      else if (!inAttackRange(user, p)) ok = false;
      else if (hasSkill(p, 'kongcheng') && p.hand.length === 0) ok = false;
      else if (!ignoreArmorOf(user)) {
        if (p.equip.armor && p.equip.armor.id === 'renwang' && isBlack(card)) ok = false;
        else if (p.equip.armor && p.equip.armor.id === 'tengjia' && !natureOf(asId)) ok = false;
      }
    } else if (asId === 'juedou') {
      if (p === user) ok = false;
      if (hasSkill(p, 'kongcheng') && p.hand.length === 0) ok = false;
    } else if (asId === 'guohe') {
      if (p === user) ok = false;
      if (cardsOf(p).length === 0) ok = false;
      if (hasSkill(p, 'weimu') && isBlack(card)) ok = false;
    } else if (asId === 'shunshou') {
      if (p === user) ok = false;
      if (cardsOf(p).length === 0) ok = false;
      if (!noDist && distance(user, p) > 1) ok = false;
      if (hasSkill(p, 'qianxun')) ok = false;
      if (hasSkill(p, 'weimu') && isBlack(card)) ok = false;
    } else if (asId === 'lebu') {
      if (p === user) ok = false;
      if (hasSkill(p, 'qianxun')) ok = false;
      if (HAS_JUDGE(p, 'lebu')) ok = false;
      if (hasSkill(p, 'weimu') && isBlack(card)) ok = false;
    } else if (asId === 'bingliang') {
      if (p === user) ok = false;
      if (!noDist && distance(user, p) > 1) ok = false;
      if (HAS_JUDGE(p, 'bingliang')) ok = false;
      if (hasSkill(p, 'weimu') && isBlack(card)) ok = false;
    } else if (asId === 'jiedao') {
      if (p === user) ok = false;
      if (!p.equip.weapon) ok = false;
    } else if (asId === 'huogong') {
      if (p.hand.length === 0) ok = false;
      if (hasSkill(p, 'weimu') && isBlack(card)) ok = false;
    } else if (asId === 'tiesuo') {
      // 任意角色
    } else if (asId === 'wuzhong' || asId === 'tao' || asId === 'jiu') {
      ok = (p === user);
    } else if (asId === 'shandian') {
      ok = (p === user);
    } else if (asId === 'nanman' || asId === 'wanjian' || asId === 'taoyuan' || asId === 'wugu') {
      ok = true;
    } else {
      ok = false;
    }
    if (ok) res.push(p);
  }
  return res;
}

function HAS_JUDGE(p, id) { return p.judgeZone.some(c => c.id === id); }

/* AI 从亮出的牌里挑最想要的一张（五谷丰登用），拿不到 AI 就用第一张 */
function aiBestPick(p, pool) {
  const ref = (typeof AI !== 'undefined' && AI && AI.cardValue) ? AI
    : (typeof window !== 'undefined' && window.AI && window.AI.cardValue ? window.AI : null);
  if (!ref) return pool[0];
  return pool.slice().sort((a, b) => ref.cardValue(p, b) - ref.cardValue(p, a))[0];
}

/* 重铸：弃置此牌并摸一张牌（目前仅【铁索连环】） */
async function recastCard(p, card) {
  if (!p || !card || !p.hand.includes(card)) return false;
  const info = CARD_INFO[card.id];
  if (!info || !info.recast) return false;
  takeFromHand(p, card);
  toDiscard(card);
  log(`${p.name} 重铸 ${cardText(card)}`, 'dim');
  await beat('recast', { player: p, card });
  await drawCards(p, 1);
  if (typeof UI !== 'undefined') UI.render();
  return true;
}

/* 这张牌用掉之后手牌是否为空（方天画戟的发动条件）。
   牌还在手里时 hand.length 里包含它，所以「1 张」才是最后一张。 */
function isLastHandCard(p, card) {
  if (!card) return p.hand.length === 0;
  const inHand = p.hand.some(c => c.uid === card.uid);
  return inHand ? p.hand.length === 1 : p.hand.length === 0;
}

/* 目标数量 */
function targetCountRange(user, asId, card) {
  // 装备牌直接进装备区，不需要目标
  const tinfo = CARD_INFO[asId];
  if (tinfo && tinfo.type === 'equip') return { min: 0, max: 0, auto: true };
  if (asId === 'sha' || asId === 'huosha' || asId === 'leisha') {
    let max = 1;
    // 方天画戟：使用的【杀】是自己的最后手牌时，可额外选择至多两名目标
    if (user.equip.weapon && user.equip.weapon.id === 'fangtian' && isLastHandCard(user, card)) max = 3;
    return { min: 1, max };
  }
  if (asId === 'tiesuo') return { min: 1, max: 2 };
  if (['nanman', 'wanjian', 'taoyuan', 'wugu'].includes(asId)) return { min: 0, max: 0, auto: true };
  if (asId === 'wuzhong' || asId === 'tao' || asId === 'jiu' || asId === 'shandian') return { min: 0, max: 0, auto: true };
  return { min: 1, max: 1 };
}

/* 校验并执行出牌 */
async function useCard(user, card, targets, opts) {
  opts = opts || {};
  if (!card || !user.alive) return false;
  const asId = opts.asId || card.id;
  const info = CARD_INFO[asId];
  if (!info) return false;

  /* --- 校验 --- */
  // noShaLimit：装备技能带来的「额外使用一张【杀】」不计入出杀次数
  if (isShaId(asId) && !(opts && opts.noShaLimit)) {
    if (!hasSkill(user, 'paoxiao') && !(user.equip.weapon && user.equip.weapon.id === 'zhuge')) {
      if (user.shaCount >= 1) { return false; }
    }
  }
  // 朱雀羽扇：普通【杀】当火【杀】使用，必须有这把武器
  if (asId === 'huosha' && card.id === 'sha') {
    if (!canAsFireSha(user, card)) return false;
    log(`${user.name} 发动【朱雀羽扇】，将普通【杀】当火【杀】使用`, 'skill');
  }
  // 丈八蛇矛：额外的一张牌必须真的在手上，且确实装了这把武器
  const extra = (opts.extraCards || []).filter(c => c && c.uid !== card.uid);
  if (extra.length > 1) return false;
  if (extra.length && info.type === 'equip') return false;
  if (extra.length === 1 && (!canZhangba(user) || !user.hand.includes(extra[0]))) return false;
  const legal = validTargets(user, asId, card);
  targets = (targets || []).filter(t => t && t.alive && legal.includes(t));
  const tc = targetCountRange(user, asId, card);
  // 超过上限的目标直接裁掉（方天画戟最多 3 个，普通【杀】1 个）
  if (!tc.auto && tc.max && targets.length > tc.max) targets = targets.slice(0, tc.max);
  if (tc.auto) {
    if (asId === 'wuzhong' || asId === 'tao' || asId === 'jiu' || asId === 'shandian') targets = [user];
    // 群体锦囊一律「从使用者开始」按行动顺序结算（五谷的选牌顺序依赖它）
    else if (asId === 'taoyuan' || asId === 'wugu') targets = seatOrder(user, true);
    else targets = seatOrder(user, false);   // 南蛮 / 万箭：不含使用者
  }
  if (targets.length < tc.min && !tc.auto) return false;

  /* --- 从手牌移除 --- */
  if (!removeCardAnywhere(user, card)) return false;
  for (const c of extra) removeCardAnywhere(user, c);

  /* --- 装备牌走单独流程（无需目标） --- */
  if (info.type === 'equip') {
    targets = [];
    await equipCard(user, card);
    return true;
  }

  /* --- 酒 --- */
  if (asId === 'jiu') {
    if (user.jiuUsed) { gainCards(user, [card]); return false; }
    user.jiuUsed = true;
    user.wineBonus = 1;
    toDiscard(card);
    log(`${user.name} 使用【酒】，本回合下一张【杀】伤害+1`, 'dim');
    if (typeof UI !== 'undefined') UI.render();
    return true;
  }

  // 只有真的【杀】才算「用过杀」；以前这里对所有牌都置位，导致吕蒙用一张锦囊就失去克己
  if (isShaId(asId)) {
    user.shaCount++;
    markShaUsed(user);
  }
  user.usedCardThisTurn++;

  /* --- 展示 --- */
  G.processing = card;
  if (extra.length) {
    log(`${user.name} 发动【丈八蛇矛】，将 ${cardText(card)} + ${cardText(extra[0])} 当【杀】使用`, 'use');
  } else {
    log(`${user.name} 使用 ${cardText(card)}${asId !== card.id ? `（视为【${info.name}】）` : ''}`, 'use');
  }
  if (targets.length) log(`　目标：${targets.map(t => t.name).join('、')}`, 'dim');
  if (!extra.length && targets.length > 1 && user.equip.weapon && user.equip.weapon.id === 'fangtian') {
    log(`${user.name} 发动【方天画戟】，额外指定 ${targets.length - 1} 个目标`, 'skill');
  }
  if (typeof UI !== 'undefined') UI.render();
  await beat('card', { player: user, card, asId, targets });

  /* --- 使用牌时触发（集智等） --- */
  await fire('onUseCard', user, { card, asId, targets });

  /* --- 无懈可击 --- */
  if (isTrick(asId)) {
    if (await askWuxie(user, card, asId, targets)) {
      log(`【${info.name}】被【无懈可击】抵消`, 'dim');
      toDiscard(card);
      G.processing = null;
      return true;
    }
  }

  /* --- 结算 --- */
  await resolveCard(user, card, asId, targets, opts);

  toDiscard(extra.length ? [card].concat(extra) : card);
  G.processing = null;
  if (typeof UI !== 'undefined') UI.render();
  return true;
}

async function equipCard(user, card) {
  const sub = CARD_INFO[card.id].sub;
  const old = user.equip[sub];
  user.equip[sub] = card;
  if (old) { onLoseEquip(user, old); toDiscard(old); }
  log(`${user.name} 装备 ${cardText(card)}`, 'equip');
  await beat('card', { player: user, card, equip: true });
  if (typeof UI !== 'undefined') UI.render();
}

/* ================= 无懈可击 ================= */

async function askWuxie(user, card, asId, targets, depth) {
  depth = depth || 0;
  if (depth > 2) return false;
  const info = CARD_INFO[asId];
  const order = seatOrder(user);
  for (const q of order) {
    if (!q.hand.some(c => c.id === 'wuxie' || (hasSkill(q, 'qixi') && false))) continue;
    const r = await ask(q, {
      kind: 'wuxie',
      prompt: `${user.name} 使用了【${info.name}】${targets && targets.length ? `（目标：${targets.map(t => t.name).join('、')}）` : ''}，是否使用【无懈可击】？`,
      card, asId,
    });
    if (r && r.card) {
      takeFromHand(q, r.card);
      log(`${q.name} 使用【无懈可击】`, 'wuxie');
      G.processing = r.card;
      if (typeof UI !== 'undefined') UI.render();
      toDiscard(r.card);
      // 反无懈
      if (await askWuxie(q, card, asId, targets, depth + 1)) {
        return false;
      }
      return true;
    }
  }
  return false;
}

/* ================= 卡牌结算 ================= */

async function resolveCard(user, card, asId, targets, opts) {
  switch (asId) {
    case 'sha': case 'huosha': case 'leisha':
      await resolveSha(user, card, asId, targets, opts); break;
    case 'tao':
      await heal(user, 1); break;
    case 'wuzhong':
      drawCards(user, 2); break;
    case 'juedou':
      await resolveJuedou(user, card, targets[0]); break;
    case 'guohe': {
      const t = targets[0];
      if (!t || !t.alive) break;
      const c = await pickCardFrom(user, t, '弃置');
      if (c) {
        // 这条日志带「谁拆了谁的哪张牌」的上下文，比通用弃牌日志更完整
        discardCards(t, c, { silent: true });
        log(`${user.name} 弃置了 ${t.name} 的 ${cardText(c)}`, 'dim');
      }
      break;
    }
    case 'shunshou': {
      const t = targets[0];
      if (!t || !t.alive) break;
      const c = await pickCardFrom(user, t, '获得');
      if (c) { gainCards(user, [c], t); log(`${user.name} 获得了 ${t.name} 的一张牌`, 'dim'); }
      break;
    }
    case 'jiedao': {
      const t = targets[0];
      if (!t || !t.alive) break;
      // 受害者候选要按【杀】的合法性过滤（藤甲/仁王盾/超距离都不行）。
      // 用「t 手上真的有能打到的杀」来判断，避免虚拟牌无花色导致仁王盾误判。
      const victims = alivePlayers().filter(p => p !== t && canShaTarget(t, p));
      if (!victims.length) break;
      const v = await chooseTarget(user, victims, 1, `${t.name} 需对一名角色使用【杀】`);
      if (!v.length) break;
      // 已经用完出杀次数的话，借刀杀人只能让对方交武器
      const canShaNow = (q) => q.shaCount < 1 || hasSkill(q, 'paoxiao')
        || !!(q.equip.weapon && q.equip.weapon.id === 'zhuge');
      const r = canShaNow(t) ? await pickShaCards(t,
        `【借刀杀人】：对 ${v[0].name} 使用一张【杀】，否则将武器交给 ${user.name}`, v[0]) : null;
      let done = false;
      if (r) done = await useCard(t, r.cards[0], [v[0]], shaUseOpts(t, r));
      if (!done) {
        const w = t.equip.weapon;
        if (w) { t.equip.weapon = null; gainCards(user, [w], t); log(`${user.name} 获得了 ${t.name} 的 ${cardText(w)}`, 'dim'); }
      }
      break;
    }
    case 'nanman': {
      for (const t of targets) {
        if (!t.alive) continue;
        if (hasSkill(t, 'huoshou') || hasSkill(t, 'juxiang')) { log(`【南蛮入侵】对 ${t.name} 无效`, 'skill'); continue; }
        if (t.equip.armor && t.equip.armor.id === 'tengjia') { log(`【藤甲】使 ${t.name} 免受【南蛮入侵】`, 'skill'); continue; }
        const ok = await askShaResponse(t, card, user, '请打出一张【杀】响应【南蛮入侵】');
        if (!ok) await damage(user, t, 1, card, null);
      }
      // 祸首 / 巨象：其他角色使用的【南蛮入侵】结算后归其所有
      const owner = alivePlayers().find(q => q !== user && (hasSkill(q, 'huoshou') || hasSkill(q, 'juxiang')));
      if (owner) {
        card._taken = true;
        gainCards(owner, [card]);
        log(`【${hasSkill(owner, 'huoshou') ? '祸首' : '巨象'}】${owner.name} 获得了【南蛮入侵】`, 'skill');
      }
      break;
    }
    case 'wanjian': {
      for (const t of targets) {
        if (!t.alive) continue;
        if (t.equip.armor && t.equip.armor.id === 'tengjia') { log(`【藤甲】使 ${t.name} 免受【万箭齐发】`, 'skill'); continue; }
        const ok = await respondShan(t, { card, source: user, reason: '万箭齐发' });
        if (!ok) await damage(user, t, 1, card, null);
      }
      break;
    }
    case 'taoyuan':
      for (const t of targets) { if (t.alive && t.hp < t.maxHp) await heal(t, 1); }
      break;
    case 'wugu': {
      const n = targets.length;
      const pool = [];
      for (let i = 0; i < n; i++) { const c = drawOne(); if (c) pool.push(c); }
      log(`【五谷丰登】亮出：${pool.map(cardText).join('，')}`, 'dim');
      for (const t of targets) {
        if (!t.alive || pool.length === 0) continue;
        let c;
        if (t.isAI) c = aiBestPick(t, pool);
        else {
          const r = await ask(t, { kind: 'pickOne', cards: pool.slice(), prompt: '选择一张牌获得' });
          c = (r && r.card) || pool[0];
        }
        const idx = pool.findIndex(x => x.uid === c.uid);
        if (idx >= 0) { pool.splice(idx, 1); t.hand.push(c); log(`${t.name} 获得 ${cardText(c)}`, 'dim'); }
      }
      pool.forEach(c => toDiscard(c));
      break;
    }
    case 'lebu': case 'bingliang': case 'shandian': {
      const t = targets[0] || user;
      if (t && t.alive) { t.judgeZone.push(card); card._placed = true; log(`${t.name} 的判定区置入【${CARD_INFO[asId].name}】`, 'dim'); }
      break;
    }
    case 'huogong': {
      const t = targets[0];
      if (!t || !t.alive || t.hand.length === 0) break;
      const r = await ask(t, { kind: 'pickOne', cards: t.hand.slice(), prompt: '【火攻】展示一张手牌', reveal: true });
      const shown = (r && r.card) || t.hand[0];
      log(`${t.name} 展示了 ${cardText(shown)}`, 'dim');
      const valid = user.hand.filter(c => c.suit === shown.suit);
      if (valid.length) {
        const r2 = await ask(user, {
          kind: 'discard',
          min: 1, max: 1,
          title: '弃牌',
          cards: valid,
          prompt: `是否弃置一张${SUIT_CN[shown.suit]}牌，对 ${t.name} 造成1点火焰伤害？`,
          cancelable: true,
        });
        if (r2 && r2.cards && r2.cards.length) {
          discardCards(user, r2.cards);
          await damage(user, t, 1, card, 'fire');
        }
      }
      break;
    }
    case 'tiesuo': {
      for (const t of targets) {
        if (!t.alive) continue;
        t.flags.chained = !t.flags.chained;
        log(`${t.name} ${t.flags.chained ? '横置' : '重置'}`, 'dim');
      }
      break;
    }
    case 'wuxie':
      break;
    default:
      break;
  }
}

/* 从目标处选一张牌 */
async function pickCardFrom(user, target, verb) {
  const all = cardsOf(target);
  if (!all.length) return null;
  if (user.isAI) {
    // AI 优先拆装备/手牌随机
    const equip = all.filter(c => c.id && CARD_INFO[c.id].type === 'equip');
    return equip.length && Math.random() < 0.5 ? equip[0] : all[Math.floor(Math.random() * all.length)];
  }
  const r = await ask(user, {
    kind: 'pickOne',
    cards: all,
    prompt: `选择 ${target.name} 的一张牌${verb}`,
    fromTarget: target,
  });
  return (r && r.card) || all[0];
}

/* 杀 */
async function resolveSha(user, card, asId, targets, opts) {
  const nature = natureOf(asId);
  for (const t of targets) {
    if (!t || !t.alive) continue;
    // 已经通过【流离】结算过的目标不再重复结算
    if (card._handled && card._handled[t.seat]) continue;
    await shaAgainst(user, card, asId, t, nature, opts);
    if (!user.alive || G.over) break;
  }
}

/* 青釭剑：锁定技，你使用【杀】时无视目标防具 */
function ignoreArmorOf(user) {
  return !!(user && user.equip && user.equip.weapon && user.equip.weapon.id === 'qinggang');
}

async function shaAgainst(user, card, asId, target, nature, opts) {
  const ignoreArmor = ignoreArmorOf(user) || !!(opts && opts.ignoreArmor);
  // 记录这张【杀】已经结算过谁：方天画戟多目标 + 流离转移时，避免同一个人被打两次
  card._handled = card._handled || {};
  card._handled[target.seat] = true;
  // 青釭剑：无视防具时说清楚，否则玩家只看到「仁王盾没生效」会以为出 bug
  if (ignoreArmor && !(opts && opts.ignoreArmor) && target.equip.armor) {
    log(`【青釭剑】无视 ${target.name} 的【${CARD_INFO[target.equip.armor.id].name}】`, 'skill');
  }
  // 仁王盾
  if (target.equip.armor && target.equip.armor.id === 'renwang' && isBlack(card) && !ignoreArmor) {
    log(`【仁王盾】使黑色【杀】对 ${target.name} 无效`, 'skill');
    return;
  }
  // 藤甲：普通【杀】无效（火杀/雷杀有效）
  if (target.equip.armor && target.equip.armor.id === 'tengjia' && !nature && !ignoreArmor) {
    log(`【藤甲】使普通【杀】对 ${target.name} 无效`, 'skill');
    return;
  }

  await fire('onTargeted', target, { card, asId, source: user, opts: opts || {} });
  // 【流离】把这张【杀】从当前目标转走了：原目标不再结算（新目标那一层照常结算）
  if (card._divertedFrom && card._divertedFrom[target.seat]) return;

  // 铁骑：判定红色则不能闪
  let noShan = false;
  if (hasSkill(user, 'tieji')) {
    if (await confirm(user, '是否发动【铁骑】？', 'tieji')) {
      const j = await judge(user, 'tieji');
      if (j && isRed(j)) { noShan = true; log(`【铁骑】生效，${target.name} 不能使用【闪】`, 'skill'); }
    }
  }
  // 雌雄双股剑
  if (user.equip.weapon && user.equip.weapon.id === 'cixiong' && user.sex !== target.sex) {
    log(`【雌雄双股剑】对 ${target.name} 发动`, 'skill');
    const r = await ask(target, {
      kind: 'yesno',
      prompt: `${user.name} 发动【雌雄双股剑】，是否弃置一张手牌？（否则其摸一张牌）`,
    });
    if (r && r.yes && target.hand.length) {
      const rr = await ask(target, {
        kind: 'discard', min: 1, max: 1, title: '弃牌',
        prompt: '弃置一张手牌', cancelable: false,
      });
      discardCards(target, (rr && rr.cards) || [target.hand[0]]);
    } else {
      drawCards(user, 1);
    }
  }

  // 无双 / 肉林：需要两张闪
  let need = 1;
  if (hasSkill(user, 'wushuang')) need = 2;
  if (hasSkill(user, 'roulin') && target.sex === 'f') need = 2;
  if (user.sex === 'f' && hasSkill(target, 'roulin')) need = 2;

  let dodged = false;
  if (!noShan) {
    dodged = await respondShan(target, { card, source: user, need, reason: '杀' });
  } else {
    log(`${target.name} 无法使用【闪】`, 'dim');
  }

  if (!dodged) {
    let dmg = 1 + (user.wineBonus || 0);
    if (user.equip.weapon && user.equip.weapon.id === 'guding' && target.hand.length === 0) {
      dmg += 1;
      log(`【古锭刀】${target.name} 没有手牌，伤害+1`, 'skill');
    }
    user.wineBonus = 0;
    await damage(user, target, dmg, card, nature);
    // 麒麟弓
    if (user.equip.weapon && user.equip.weapon.id === 'qilin') {
      const horses = [target.equip.horseMinus, target.equip.horsePlus].filter(Boolean);
      if (horses.length && await confirm(user, '是否发动【麒麟弓】弃置目标的一匹马？', 'qilin')) {
        const h = horses[0];
        for (const k in target.equip) if (target.equip[k] === h) target.equip[k] = null;
        toDiscard(h);
        log(`【麒麟弓】${user.name} 弃置了 ${target.name} 的 ${cardText(h)}`, 'skill');
      }
    }
    // 烈刃
    if (hasSkill(user, 'lieren') && target.alive) {
      if (await confirm(user, '是否发动【烈刃】拼点？', 'lieren')) {
        const win = await pindian(user, target);
        if (win) {
          const c = await pickCardFrom(user, target, '获得');
          if (c) gainCards(user, [c], target);
        }
      }
    }
  } else {
    log(`${target.name} 抵消了【杀】`, 'dim');
    // 贯石斧
    if (user.equip.weapon && user.equip.weapon.id === 'guanshi' && cardsOf(user).length >= 2) {
      if (await confirm(user, '是否发动【贯石斧】弃两张牌强行命中？', 'guanshi')) {
        const r = await ask(user, {
          kind: 'discard', min: 2, max: 2, title: '弃牌',
          prompt: '弃置两张牌发动【贯石斧】', cancelable: false,
        });
        if (r && r.cards && r.cards.length === 2) {
          log(`${user.name} 发动【贯石斧】，此【杀】依然命中`, 'skill');
          discardCards(user, r.cards);
          await damage(user, target, 1 + (user.wineBonus || 0), card, nature);
          user.wineBonus = 0;
        }
      }
    }
    // 青龙偃月刀
    // 青龙偃月刀：手里真有能打到这个目标的【杀】才问，别拿虚拟牌误判仁王盾
    else if (user.equip.weapon && user.equip.weapon.id === 'qinglong'
      && canShaTarget(user, target)) {
      if (await confirm(user, '是否发动【青龙偃月刀】再使用一张【杀】？', 'qinglong')) {
        const pk = await pickShaCards(user, '请打出一张【杀】', target);
        if (pk) {
          log(`${user.name} 发动【青龙偃月刀】，再使用一张【杀】`, 'skill');
          await useCard(user, pk.cards[0], [target],
            Object.assign(shaUseOpts(user, pk), { noWeapon: true, noShaLimit: true }));
        }
      }
    }
  }
}

function opts2(user) { return false; }

/* 请求【闪】 */
/* 主公技【护驾】：令其他魏势力角色替你打出一张【闪】 */
async function askHujia(p) {
  if (!hasSkill(p, 'hujia')) return false;
  const allies = seatOrder(p).filter(q => q !== p && q.alive && q.kingdom === 'wei');
  if (!allies.length) return false;
  // 自己手里有【闪】时不打扰（玩家/AI 都先用自己的）
  const ownShan = p.hand.some(c => canAsShan(p, c));
  if (ownShan) return false;
  if (!(await confirm(p, '是否发动【护驾】？令魏势力角色替你出【闪】', 'hujia'))) return false;
  for (const q of allies) {
    const r = await ask(q, {
      kind: 'respond',
      prompt: `【护驾】：是否为主公 ${p.name} 打出一张【闪】？`,
      asId: 'shan',
      valid: c => canAsShan(q, c),
      cancelable: true,
    });
    if (r && r.card && takeFromHand(q, r.card)) {
      toDiscard(r.card);
      log(`${q.name} 响应【护驾】，替 ${p.name} 打出了【闪】`, 'skill');
      if (typeof UI !== 'undefined') UI.render();
      return true;
    }
  }
  return false;
}

async function respondShan(p, ctx) {
  const need = ctx.need || 1;
  let got = 0;
  while (got < need) {
    // 八卦阵
    if (got === 0 && p.equip.armor && p.equip.armor.id === 'bagua' && !ctx.ignoreArmor) {
      const info = await ask(p, { kind: 'yesno', prompt: '是否发动【八卦阵】？', skill: 'bagua' });
      if (info && info.yes) {
        const j = await judge(p, 'bagua');
        if (j && isRed(j)) {
          log(`【八卦阵】判定为红色，视为 ${p.name} 打出【闪】`, 'skill');
          got++;
          continue;
        }
      }
    }
    // 护驾：主公技，让别人代打
    if (got === 0 && await askHujia(p)) { got++; continue; }
    const r = await ask(p, {
      kind: 'respond',
      prompt: need > 1 ? `请打出一张【闪】（还需 ${need - got} 张）` : '请打出一张【闪】',
      asId: 'shan',
      valid: c => canAsShan(p, c),
      cancelable: true,
      reason: ctx.reason || '杀',
    });
    if (!r || !r.card) return false;
    takeFromHand(p, r.card);
    toDiscard(r.card);
    G.processing = r.card;
    log(`${p.name} 打出【闪】`, 'respond');
    if (typeof UI !== 'undefined') UI.render();
    got++;
  }
  G.processing = null;
  return got >= need;
}

/* 出牌阶段内使用 / 打出过【杀】——克己的判断依据 */
function markShaUsed(p) {
  if (G.phase === 'play' && G.players[G.current] === p) p.flags.usedSha = true;
}

/* 主公技【激将】：令其他蜀势力角色替你打出一张【杀】 */
async function askJijiang(p, prompt) {
  if (!hasSkill(p, 'jijiang')) return false;
  const allies = seatOrder(p).filter(q => q !== p && q.alive && q.kingdom === 'shu');
  if (!allies.length) return false;
  // 自己手上有可用的【杀】就不打扰
  if (p.hand.some(c => canAsSha(p, c))) return false;
  if (!(await confirm(p, '是否发动【激将】？令蜀势力角色替你出【杀】', 'jijiang'))) return false;
  for (const q of allies) {
    const r = await ask(q, {
      kind: 'respond',
      prompt: `【激将】：是否为主公 ${p.name} 打出一张【杀】？`,
      asId: 'sha',
      valid: c => canAsSha(q, c),
      cancelable: true,
    });
    if (r && r.card && takeFromHand(q, r.card)) {
      toDiscard(r.card);
      log(`${q.name} 响应【激将】，替 ${p.name} 打出了【杀】`, 'skill');
      markShaUsed(p);
      if (typeof UI !== 'undefined') UI.render();
      return true;
    }
  }
  return false;
}

/* 请求【杀】 */
async function askShaResponse(p, card, source, prompt) {
  if (await askJijiang(p, prompt)) return true;
  return await playShaCards(p, prompt || '请打出一张【杀】');
}

/* 决斗 */
async function resolveJuedou(user, card, target) {
  if (!target || !target.alive) return;
  let atk = user, def = target;
  let turn = 0;
  while (atk.alive && def.alive && turn++ < 20) {
    const need = hasSkill(def, 'wushuang') ? 2 : 1;
    let ok = true;
    for (let i = 0; i < need; i++) {
      if (i === 0 && await askJijiang(def, '【决斗】：请打出一张【杀】')) continue;
      const done = await playShaCards(def, `【决斗】：请打出一张【杀】（${i + 1}/${need}）`);
      if (!done) { ok = false; break; }
    }
    if (!ok) {
      const src = hasSkill(def, 'wushuang') ? user : atk;
      await damage(user, def, 1, card, null);
      break;
    }
    [atk, def] = [def, atk];
  }
}

/* 拼点 */
async function pindian(a, b) {
  if (!a.hand.length || !b.hand.length) return false;
  const pick = async (p) => {
    if (p.isAI) return p.hand[Math.floor(Math.random() * p.hand.length)];
    const r = await ask(p, { kind: 'pickOne', cards: p.hand.slice(), prompt: '选择一张牌拼点' });
    return (r && r.card) || p.hand[0];
  };
  const ca = await pick(a), cb = await pick(b);
  if (!ca || !cb) return false;
  takeFromHand(a, ca); takeFromHand(b, cb);
  toDiscard([ca, cb]);
  log(`拼点：${a.name} ${cardText(ca)} vs ${b.name} ${cardText(cb)}`, 'dim');
  return ca.num > cb.num;
}

/* ================= 选择目标封装 ================= */

async function chooseTarget(user, candidates, count, prompt, cancelable) {
  if (!candidates.length) return [];
  if (user.isAI) return candidates.slice(0, count);
  const r = await ask(user, {
    kind: 'target', min: count, max: count,
    candidates, prompt, cancelable: !!cancelable,
  });
  return (r && r.targets) || [];
}

if (typeof module !== 'undefined') module.exports = { G, newGame, gameLoop, distance };
