'use strict';
/* ============================================================
 *  三国杀 · 单机版   —— AI
 * ============================================================ */

const AI = {};

/* 关系：1 友  -1 敌  0 中立 */
function relation(me, other) {
  if (me === other) return 1;
  const a = me.identity, b = other.identity;
  if (a === 'lord' || a === 'loyal') return (b === 'rebel' || b === 'spy') ? -1 : 1;
  if (a === 'rebel') return (b === 'lord' || b === 'loyal') ? -1 : (b === 'rebel' ? 1 : 0);
  if (a === 'spy') {
    const rebels = alivePlayers().filter(x => x.identity === 'rebel').length;
    if (rebels > 1) return b === 'rebel' ? -1 : (b === 'loyal' ? 0 : 1);
    return (b === 'lord' || b === 'loyal') ? -1 : 1;
  }
  return 0;
}

const BASE_VALUE = {
  tao: 90, shan: 62, sha: 56, huosha: 60, leisha: 60, jiu: 48,
  wuzhong: 85, wuxie: 74, juedou: 66, guohe: 64, shunshou: 70,
  nanman: 68, wanjian: 68, taoyuan: 58, wugu: 60, jiedao: 52,
  lebu: 66, bingliang: 62, shandian: 40, huogong: 55, tiesuo: 50,
  zhuge: 55, qinggang: 50, cixiong: 48, qinglong: 56, zhangba: 54,
  guanshi: 52, fangtian: 58, qilin: 50, guding: 50, zhuque: 52,
  bagua: 60, renwang: 55, tengjia: 52, baiyin: 58,
  chitu: 44, dawan: 42, zixing: 42, dilu: 44, jueying: 44, zhuahuang: 44, hualiu: 44,
};

function cardValue(p, c) {
  let v = BASE_VALUE[c.id] || 40;
  if (CARD_INFO[c.id].type === 'equip') {
    const sub = CARD_INFO[c.id].sub;
    if (p.equip[sub]) v -= 25;
  }
  if (c.id === 'tao' && p.hp === p.maxHp) v -= 20;
  return v;
}

function weakestOf(list) {
  return list.slice().sort((a, b) => (a.hp - b.hp) || (a.hand.length - b.hand.length))[0];
}

/* 敌人列表 */
function enemiesOf(p) {
  return alivePlayers().filter(x => x !== p && relation(p, x) < 0);
}
function friendsOf(p) {
  return alivePlayers().filter(x => x !== p && relation(p, x) > 0);
}

/* ============================================================
 *  主决策
 * ============================================================ */

AI.decide = async function (p, req) {
  switch (req.kind) {
    case 'play': return aiPlay(p, req);
    case 'respond': return aiRespond(p, req);
    case 'discard': return aiDiscard(p, req);
    case 'yesno': return aiYesno(p, req);
    case 'choice': return aiChoice(p, req);
    case 'target': return aiTarget(p, req);
    case 'pickOne': return aiPickOne(p, req);
    case 'suit': return { suit: SUIT_KEYS[Math.floor(Math.random() * 4)] };
    case 'arrange': return aiArrange(p, req);
    case 'save': return aiSave(p, req);
    case 'wuxie': return aiWuxie(p, req);
    default: return null;
  }
};

/* ---------------- 出牌阶段 ---------------- */

function aiPlay(p, req) {
  const enemies = enemiesOf(p);
  const friends = friendsOf(p);
  const others = alivePlayers().filter(x => x !== p);

  /* 1. 回复 */
  if (p.hp < p.maxHp) {
    const tao = p.hand.find(c => c.id === 'tao');
    if (tao) return use(tao, [p]);
  }

  /* 2. 无中生有 */
  const wz = p.hand.find(c => c.id === 'wuzhong');
  if (wz) return use(wz, [p]);

  /* 3. 装备 */
  const equip = pickBestEquip(p);
  if (equip) return use(equip, []);

  /* 4. 主动技能 */
  const sk = aiPickSkill(p);
  if (sk) return { action: 'skill', id: sk };

  /* 5. 顺手牵羊 */
  const ss = p.hand.find(c => c.id === 'shunshou');
  if (ss) {
    const cands = validTargets(p, 'shunshou', ss).filter(t => relation(p, t) < 0);
    if (cands.length) return use(ss, [weakestOf(cands)]);
  }
  /* 6. 过河拆桥 */
  const gh = p.hand.find(c => c.id === 'guohe');
  if (gh) {
    const cands = validTargets(p, 'guohe', gh).filter(t => relation(p, t) < 0);
    if (cands.length) return use(gh, [weakestOf(cands)]);
  }
  /* 7. 五谷丰登 */
  const wg = p.hand.find(c => c.id === 'wugu');
  if (wg && p.hand.length < 4) return use(wg, []);

  /* 8. 桃园结义（自己受伤） */
  const ty = p.hand.find(c => c.id === 'taoyuan');
  if (ty && p.hp <= p.maxHp - 2) return use(ty, []);

  /* 9. 杀 */
  const sha = pickSha(p);
  if (sha) {
    let cands = validTargets(p, sha.id, sha).filter(t => relation(p, t) < 0);
    let asId = sha.id;
    // 朱雀羽扇：普通【杀】可以当火【杀】，用来破藤甲
    if (!cands.length && canAsFireSha(p, sha)) {
      const fireCands = validTargets(p, 'huosha', sha).filter(t => relation(p, t) < 0);
      if (fireCands.length) { cands = fireCands; asId = 'huosha'; }
    }
    if (cands.length) {
      const t = weakestOf(cands);
      return use(sha, [t], asId !== sha.id ? asId : undefined);
    }
  }

  /* 9.5 丈八蛇矛：手里没有【杀】时，用两张最没用的手牌当【杀】 */
  if (!sha && canZhangba(p) && canShaThisTurn(p)) {
    const pool = p.hand.slice().sort((a, b) => cardValue(p, a) - cardValue(p, b));
    // 用真正要打出去的那张牌算合法性：花色会影响仁王盾
    const cands = validTargets(p, 'sha', pool[0]).filter(t => relation(p, t) < 0);
    if (cands.length) {
      return { action: 'use', card: pool[0], extraCards: [pool[1]], asId: 'sha', targets: [weakestOf(cands)] };
    }
  }

  /* 10. 决斗 */
  const jd = p.hand.find(c => c.id === 'juedou');
  if (jd) {
    const cands = validTargets(p, 'juedou', jd).filter(t => relation(p, t) < 0);
    if (cands.length) {
      const t = weakestOf(cands);
      const mySha = p.hand.filter(c => isShaId(c.id)).length;
      if (mySha >= 1 || t.hand.length <= 1) return use(jd, [t]);
    }
  }

  /* 11. 南蛮/万箭（敌人多时） */
  const nm = p.hand.find(c => c.id === 'nanman');
  if (nm && aoeWorth(p, 'nanman', enemies, friends)) return use(nm, []);
  const wj = p.hand.find(c => c.id === 'wanjian');
  if (wj && aoeWorth(p, 'wanjian', enemies, friends)) return use(wj, []);

  /* 12. 乐不思蜀 / 兵粮寸断 */
  const lb = p.hand.find(c => c.id === 'lebu');
  if (lb) {
    const cands = validTargets(p, 'lebu', lb).filter(t => relation(p, t) < 0);
    if (cands.length) return use(lb, [cands[0]]);
  }
  const bl = p.hand.find(c => c.id === 'bingliang');
  if (bl) {
    const cands = validTargets(p, 'bingliang', bl).filter(t => relation(p, t) < 0);
    if (cands.length) return use(bl, [cands[0]]);
  }

  /* 13. 火攻 */
  const hg = p.hand.find(c => c.id === 'huogong');
  if (hg) {
    const cands = validTargets(p, 'huogong', hg).filter(t => relation(p, t) < 0);
    if (cands.length) return use(hg, [cands[0]]);
  }

  /* 14. 铁索连环（横置敌人；一次能连两个就连两个，否则串联传导没有意义） */
  const ts = p.hand.find(c => c.id === 'tiesuo');
  if (ts) {
    const cands = validTargets(p, 'tiesuo', ts).filter(t => relation(p, t) < 0 && !t.flags.chained);
    if (cands.length && p.hand.length > 3) return use(ts, cands.slice(0, 2));
    // 没目标可连：与其留到弃牌阶段，不如重铸换一张
    if (!cands.length && p.hand.length > 3) return { action: 'recast', card: ts };
  }

  /* 15. 借刀杀人 */
  const jdao = p.hand.find(c => c.id === 'jiedao');
  if (jdao) {
    const cands = validTargets(p, 'jiedao', jdao);
    if (cands.length) return use(jdao, [cands[0]]);
  }

  /* 16. 桃溢出时也留着，结束 */
  return { action: 'end' };
}

function use(card, targets, asId) { return { action: 'use', card, targets, asId }; }

/* 本回合还能不能再出【杀】：与引擎 useCard 的校验保持一致，
   否则 AI 会反复提交同一张杀、被引擎拒绝，形成空转 */
function canShaThisTurn(p) {
  if (p.shaCount < 1) return true;
  return hasSkill(p, 'paoxiao') || !!(p.equip.weapon && p.equip.weapon.id === 'zhuge');
}

/* 群体锦囊值不值得放：打的敌人要多于误伤的队友，且对方没被藤甲免疫 */
function aoeWorth(p, id, enemies, friends) {
  const hitFoes = enemies.filter(t => t.alive && !armorImmune(t, id)).length;
  const hitMates = friends.filter(t => t.alive && !armorImmune(t, id)).length;
  if (hitFoes < 1) return false;
  if (hitFoes < hitMates) return false;                    // 误伤比收益大，不打
  return p.hand.length > 2 || hitFoes >= 2;
}

/* 防具是否让该角色免疫这类牌（藤甲：南蛮 / 万箭 / 普通【杀】） */
function armorImmune(p, id) {
  const a = p.equip && p.equip.armor;
  return !!(a && a.id === 'tengjia' && (id === 'nanman' || id === 'wanjian' || id === 'sha'));
}

function pickSha(p) {
  if (!canShaThisTurn(p)) return null;
  const shas = p.hand.filter(c => isShaId(c.id));
  if (!shas.length) return null;
  const inRange = shas.find(c => validTargets(p, c.id, c).some(t => relation(p, t) < 0));
  return inRange || null;
}

function pickBestEquip(p) {
  const equips = p.hand.filter(c => CARD_INFO[c.id].type === 'equip');
  let best = null, bestScore = 0;
  for (const c of equips) {
    const info = CARD_INFO[c.id];
    const sub = info.sub;
    let score = 10;
    const cur = p.equip[sub];
    if (sub === 'weapon') {
      score = (info.range || 1) * 3 + (c.id === 'zhuge' ? 12 : 0) + (c.id === 'qinglong' ? 6 : 0) + (c.id === 'guanshi' ? 6 : 0);
      if (cur) score -= (CARD_INFO[cur.id].range || 1) * 3;
    } else if (sub === 'armor') {
      score = 12;
      if (cur) score -= 12;              // 已经有防具就不再折腾
    } else {
      score = 8;
      if (cur) score -= 8;               // 已经有同槽坐骑就不换
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function aiPickSkill(p) {
  const opts = playOptions(p);
  for (const o of opts) {
    const id = o.id;
    // 已经用过的限定技/本阶段限一次技能，不要再想
    if (!activeAvailable(p, id)) continue;
    if (id === 'zhiheng') {
      const bad = p.hand.filter(c => cardValue(p, c) < 50).length;
      if (bad >= 2 || p.hand.length >= 4) return id;
    }
    if (id === 'kurou') {
      if (p.hp >= 3 && p.hand.length <= 2) return id;
      if (p.hp >= 2 && p.hand.length === 0) return id;
    }
    if (id === 'rende') {
      const f = friendsOf(p).filter(x => x !== p);
      if (f.length && p.hand.length > 3) return id;
    }
    if (id === 'qingnang') {
      if (!p.hand.length) continue;                 // 青囊要弃一张手牌，没牌发动不了
      const wounded = alivePlayers().filter(x => x.hp < x.maxHp && relation(p, x) >= 0);
      if (wounded.length) return id;
    }
    if (id === 'jieyin') {
      if (p.hp < p.maxHp && p.hand.length >= 3) {
        const m = alivePlayers().find(x => x !== p && x.sex === 'm' && x.hp < x.maxHp);
        if (m) return id;
      }
    }
    if (id === 'fanjian') {
      if (p.hand.length >= 2 && enemiesOf(p).length) return id;
    }
    if (id === 'lijian') {
      const males = alivePlayers().filter(x => x.sex === 'm' && x !== p && relation(p, x) < 0);
      if (males.length >= 2 && p.hand.length > 1) return id;
    }
    if (id === 'luanwu') {
      if (enemiesOf(p).length >= 2) return id;
    }
    if (id === 'dimeng') {
      const o = alivePlayers().filter(x => x !== p);
      if (o.length >= 2 && Math.abs(o[0].hand.length - o[1].hand.length) <= 2) return id;
    }
  }
  return null;
}

/* ---------------- 响应 ---------------- */

function aiRespond(p, req) {
  if (!req.valid) return null;
  const cands = p.hand.filter(req.valid);
  if (cands.length) {
    // 选择最"便宜"的牌
    cands.sort((a, b) => cardValue(p, a) - cardValue(p, b));
    return { card: cands[0] };
  }
  // 丈八蛇矛：没有能当【杀】的牌时，用两张最没用的手牌凑一张
  if (req.zhangba && p.hand.length >= 2) {
    const pool = p.hand.slice().sort((a, b) => cardValue(p, a) - cardValue(p, b));
    return { cards: [pool[0], pool[1]] };
  }
  return null;
}

function aiSave(p, req) {
  const t = req.target;
  if (!t) return null;
  const isFriend = t === p || relation(p, t) > 0;
  if (!isFriend) return null;
  const tao = p.hand.find(c => c.id === 'tao');
  if (tao) return { card: tao };
  if (t === p) {
    // 濒死时【酒】也可以自救（不受回合归属限制）
    const jiu = p.hand.find(c => c.id === 'jiu');
    if (jiu) return { card: jiu };
  }
  if (hasSkill(p, 'jijiu') && G.players[G.current] !== p) {
    const red = p.hand.find(c => isRed(c));
    if (red) return { card: red };
  }
  return null;
}

function aiWuxie(p, req) {
  const cands = p.hand.filter(c => c.id === 'wuxie');
  if (!cands.length) return null;
  const card = req.card;
  if (!card) return null;
  // 判断该锦囊是否对我方不利
  const targets = G._lastTargets || [];
  let harmful = false;
  const bad = ['shunshou', 'guohe', 'juedou', 'lebu', 'bingliang', 'huogong', 'nanman', 'wanjian', 'sha'];
  for (const t of targets) {
    if (relation(p, t) < 0) continue;
    if (bad.includes(req.asId)) harmful = true;
  }
  const good = ['taoyuan', 'wugu', 'wuzhong'];
  for (const t of targets) {
    if (relation(p, t) < 0 && good.includes(req.asId)) harmful = true;
  }
  if (!harmful) return null;
  if (Math.random() < 0.25) return null;
  return { card: cands[0] };
}

/* ---------------- 选牌 ---------------- */

function aiDiscard(p, req) {
  // pool / cards 限定可选范围（火攻只能弃同花色），不能从整手牌里随便挑
  const pool = (req.pool || (Array.isArray(req.cards) && req.cards.length ? req.cards : p.hand)).slice();
  pool.sort((a, b) => cardValue(p, a) - cardValue(p, b));
  const need = req.min || 1;
  const pick = pool.slice(0, need);
  return pick.length ? { cards: pick } : null;
}

function aiPickOne(p, req) {
  const cards = req.cards || [];
  if (!cards.length) return null;
  if (req.autoPick === 'worst') {
    const s = cards.slice().sort((a, b) => cardValue(p, a) - cardValue(p, b));
    return { card: s[0] };
  }
  if (req.reveal) {
    return { card: cards[Math.floor(Math.random() * cards.length)] };
  }
  // 从别人那里拿牌：优先拿装备/桃
  const pri = cards.slice().sort((a, b) => {
    const av = (CARD_INFO[a.id].type === 'equip' ? 60 : 0) + (a.id === 'tao' ? 70 : 0) + (a.id === 'wuzhong' ? 50 : 0);
    const bv = (CARD_INFO[b.id].type === 'equip' ? 60 : 0) + (b.id === 'tao' ? 70 : 0) + (b.id === 'wuzhong' ? 50 : 0);
    return bv - av;
  });
  return { card: pri[0] };
}

function aiTarget(p, req) {
  const cands = (req.candidates || []).filter(Boolean);
  if (!cands.length) return { targets: [] };
  const min = req.min || 1;
  const enemies = cands.filter(x => relation(p, x) < 0);
  const friends = cands.filter(x => relation(p, x) > 0);
  const sorted = (enemies.length ? enemies : cands).slice().sort((a, b) => a.hp - b.hp);
  return { targets: sorted.slice(0, min) };
}

function aiChoice(p, req) {
  const opts = req.options || [];
  if (!opts.length) return { option: null };
  return { option: opts[0].id };
}

function aiYesno(p, req) {
  const sid = req.skill;
  const text = req.prompt || '';
  if (!sid) {
    if (text.includes('雌雄双股剑')) return { yes: p.hand.length > 2 };
    if (text.includes('麒麟弓')) return { yes: true };
    if (text.includes('克己')) return { yes: true };
    if (text.includes('贯石斧')) return { yes: p.hand.length >= 4 };
    if (text.includes('青龙偃月刀')) return { yes: p.hand.some(c => isShaId(c.id)) };
    return { yes: Math.random() < 0.5 };
  }
  switch (sid) {
    case 'jianxiong': case 'fankui': case 'tiandu': case 'yiji':
    case 'luoshen': case 'guanxing': case 'ganglie': case 'tieji':
    case 'liuli': case 'biyue': case 'xingshang': case 'songwei':
      return { yes: true };
    case 'luoyi':
      return { yes: p.hand.some(c => isShaId(c.id)) };
    case 'tuxi':
      return { yes: alivePlayers().some(x => x !== p && x.hand.length) };
    case 'guicai': {
      // 仅当判定结果对自己不利时改判
      return { yes: false };
    }
    case 'fangzhu':
      return { yes: true };
    case 'lieren':
      return { yes: true };
    case 'zaiqi':
      return { yes: p.hp < p.maxHp - 1 };
    case 'haoshi':
      return { yes: p.hand.length <= 3 };
    case 'yinghun':
      return { yes: true };
    case 'bagua': case 'hujia': case 'jijiang':
      return { yes: true };
    default:
      return { yes: true };
  }
}

function aiArrange(p, req) {
  const cards = (req.cards || []).slice();
  cards.sort((a, b) => cardValue(p, b) - cardValue(p, a));
  return { top: cards, bottom: [] };
}

/* 供引擎复用（五谷丰登等「从亮出的牌里挑一张」的场景） */
AI.cardValue = cardValue;
if (typeof window !== 'undefined') window.AI = AI;
