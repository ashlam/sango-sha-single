'use strict';
/* ============================================================
 *  三国杀 · 单机版   —— 武将技能
 *  hook 由引擎在对应时机调用
 * ============================================================ */

const SKILLS = {};

/* 玩家/AI 是否发动某个可选技能的判断入口（AI 在 ai.js 里覆写） */
async function trySkill(p, sid) {
  const sk = SKILLS[sid];
  if (!sk) return false;
  return await confirm(p, `是否发动【${sk.name}】？`, sid);
}

/* 视为技：返回该牌可被当作的牌名列表 */
function viewsOf(p, card) {
  const out = [];
  if (!card || card.virtual) return out;
  for (const sid of p.skills) {
    const sk = SKILLS[sid];
    if (sk && sk.viewAs) {
      try { out.push(...(sk.viewAs(p, card) || [])); } catch (e) { }
    }
  }
  // 朱雀羽扇：普通【杀】可以当火【杀】使用（武器带来的视为，不属于武将技能）
  if (card.id === 'sha' && p.equip && p.equip.weapon && p.equip.weapon.id === 'zhuque') {
    out.push({ id: 'huosha', label: '火杀' });
  }
  return out;
}

/* 主动技可用性 */
function activeAvailable(p, sid) {
  const sk = SKILLS[sid];
  if (!sk || !sk.active) return false;
  if (sk.limit && p.usedActive && p.usedActive[sid]) return false;
  if (sk.once && p.marks[sid]) return false;
  if (sk.cond && !sk.cond(p)) return false;
  return true;
}

/* ============================================================
 *  魏
 * ============================================================ */

SKILLS.jianxiong = {
  name: '奸雄', desc: '当你受到伤害后，你可以获得对你造成伤害的牌。',
  async afterDamage(p, ctx) {
    const c = ctx.card;
    if (!c || c.virtual || !c.id) return;
    if (!(await trySkill(p, 'jianxiong'))) return;
    // 这张牌还在结算流程里，标记一下，避免结算结束时又被丢进弃牌堆
    G.discard = G.discard.filter(x => x !== c);
    c._taken = true;
    gainCards(p, [c]);
    log(`${p.name} 发动【奸雄】获得了 ${cardText(c)}`, 'skill');
    if (typeof UI !== 'undefined') UI.render();
  }
};

SKILLS.hujia = {
  name: '护驾', desc: '主公技。当你需要使用或打出一张【闪】时，你可以令其他魏势力角色打出一张【闪】（视为由你打出）。',
  lord: true
};

SKILLS.fankui = {
  name: '反馈', desc: '当你受到伤害后，你可以获得伤害来源的一张牌。',
  async afterDamage(p, ctx) {
    const s = ctx.source;
    if (!s || !s.alive || cardsOf(s).length === 0) return;
    if (!(await trySkill(p, 'fankui'))) return;
    const c = await pickCardFrom(p, s, '获得');
    if (c) { gainCards(p, [c], s); log(`${p.name} 发动【反馈】获得了 ${s.name} 的一张牌`, 'skill'); }
  }
};

SKILLS.guicai = {
  name: '鬼才', desc: '当一名角色的判定牌生效前，你可以打出一张手牌代替之。',
  async modifyJudge(p, ctx) {
    if (!p.hand.length) return null;
    if (!(await confirm(p, `【鬼才】：${ctx.target.name} 判定为 ${cardText(ctx.card)}，是否打出一张手牌代替？`, 'guicai'))) return null;
    const r = await ask(p, { kind: 'pickOne', cards: p.hand.slice(), prompt: '选择一张手牌代替判定牌', autoPick: 'worst' });
    if (!r || !r.card) return null;
    takeFromHand(p, r.card);
    return r.card;
  }
};

SKILLS.ganglie = {
  name: '刚烈', desc: '当你受到伤害后，你可以进行判定：若结果不为红桃，则伤害来源选择一项：弃置两张手牌，或受到你造成的1点伤害。',
  async afterDamage(p, ctx) {
    const s = ctx.source;
    if (!s || !s.alive) return;
    if (!(await trySkill(p, 'ganglie'))) return;
    const j = await judge(p, 'ganglie');
    if (j && j.suit === 'h') { log('【刚烈】判定为红桃，无效', 'dim'); return; }
    if (s.hand.length >= 2) {
      const r = await ask(s, { kind: 'choice', prompt: `【刚烈】：弃置两张手牌，或受到1点伤害`, options: [{ id: 'discard', label: '弃置两张手牌' }, { id: 'damage', label: '受到1点伤害' }] });
      if (r && r.option === 'discard') {
        const rr = await ask(s, { kind: 'discard', min: 2, max: 2, prompt: '弃置两张手牌' });
        discardCards(s, (rr && rr.cards) || s.hand.slice(0, 2));
        return;
      }
    }
    await damage(p, s, 1, null, null);
  }
};

SKILLS.tuxi = {
  name: '突袭', desc: '摸牌阶段，你可以改为获得至多两名其他角色的各一张手牌。',
  async modifyDraw(p, ctx) {
    const others = alivePlayers().filter(x => x !== p && x.hand.length > 0);
    if (!others.length) return ctx.n;
    if (!(await confirm(p, '是否发动【突袭】改为获得其他角色的手牌？', 'tuxi'))) return ctx.n;
    let n = Math.min(2, others.length);
    const chosen = p.isAI ? others.slice(0, n) : await chooseTarget(p, others, n, '选择至多两名角色，各获得一张手牌');
    for (const t of (chosen.length ? chosen : others.slice(0, 1))) {
      if (!t.hand.length) continue;
      const c = t.hand[Math.floor(Math.random() * t.hand.length)];
      gainCards(p, [c], t);
      log(`${p.name} 发动【突袭】获得了 ${t.name} 的一张手牌`, 'skill');
    }
    return 0;
  }
};

SKILLS.luoyi = {
  name: '裸衣', desc: '摸牌阶段，你可以少摸一张牌，若如此做，本回合你使用【杀】或【决斗】造成的伤害+1。',
  async modifyDraw(p, ctx) {
    if (!(await confirm(p, '是否发动【裸衣】？本回合【杀】与【决斗】伤害+1', 'luoyi'))) return ctx.n;
    p.marks.luoyi = true;
    log(`${p.name} 发动【裸衣】`, 'skill');
    return Math.max(0, ctx.n - 1);
  }
};

SKILLS.tiandu = {
  name: '天妒', desc: '当你的判定牌生效后，你可以获得此牌。',
  async afterJudge(p, ctx) {
    if (!ctx.card || ctx.card.virtual) return;
    if (!(await trySkill(p, 'tiandu'))) return;
    gainCards(p, [ctx.card]);
    log(`${p.name} 发动【天妒】获得了判定牌`, 'skill');
  }
};

SKILLS.yiji = {
  name: '遗计', desc: '当你受到1点伤害后，你可以摸两张牌，然后交给任意角色。',
  async afterDamage(p, ctx) {
    if (!(await trySkill(p, 'yiji'))) return;
    const cards = drawCards(p, 2);
    log(`${p.name} 发动【遗计】摸两张牌`, 'skill');
    if (typeof UI !== 'undefined') UI.render();
    for (const c of cards) {
      const cands = alivePlayers();
      let t = p;
      if (!p.isAI) {
        const r = await ask(p, { kind: 'target', candidates: cands, min: 1, max: 1, prompt: `遗计：将 ${cardText(c)} 交给谁？` });
        t = (r && r.targets && r.targets[0]) || p;
      }
      if (t !== p) {
        removeCardAnywhere(p, c);
        t.hand.push(c);
        log(`　将 ${cardText(c)} 交给了 ${t.name}`, 'dim');
      }
    }
  }
};

SKILLS.qingguo = {
  name: '倾国', desc: '你可以将一张黑色手牌当【闪】使用或打出。',
  viewAs(p, card) {
    if (!isBlack(card)) return [];
    return [{ id: 'shan', label: '闪' }];
  }
};

SKILLS.luoshen = {
  name: '洛神', desc: '准备阶段，你可以进行判定：若结果为黑色，你获得此牌并重复此流程。',
  async preparePhase(p) {
    if (!(await confirm(p, '是否发动【洛神】？', 'luoshen'))) return;
    let guard = 0;
    while (guard++ < 20) {
      const j = await judge(p, 'luoshen');
      if (!j) break;
      if (isBlack(j)) {
        gainCards(p, [j]);
        log(`${p.name} 发动【洛神】获得 ${cardText(j)}`, 'skill');
        if (typeof UI !== 'undefined') UI.render();
      } else break;
    }
  }
};

/* ============================================================
 *  蜀
 * ============================================================ */

SKILLS.rende = {
  name: '仁德', desc: '出牌阶段，你可以将任意张手牌交给一名其他角色。当你于此阶段给出第二张牌时，你回复1点体力。',
  active: true,
  async active(p) {
    if (!p.hand.length) return false;
    const r = await ask(p, { kind: 'discard', min: 1, max: p.hand.length, prompt: '选择要交给其他角色的手牌', cancelable: true });
    if (!r || !r.cards || !r.cards.length) return false;
    const t = (await chooseTarget(p, alivePlayers().filter(x => x !== p), 1, '选择一名角色'))[0];
    if (!t) return false;
    const cards = r.cards.slice();
    cards.forEach(c => { removeCardAnywhere(p, c); t.hand.push(c); });
    log(`${p.name} 发动【仁德】将 ${cards.length} 张牌交给 ${t.name}`, 'skill');
    p.marks.rende = (p.marks.rende || 0) + cards.length;
    if (p.marks.rende >= 2 && !p.marks.rendeHealed) {
      p.marks.rendeHealed = true;
      await heal(p, 1);
    }
    if (typeof UI !== 'undefined') UI.render();
    return true;
  }
};

SKILLS.jijiang = {
  name: '激将', desc: '主公技。当你需要使用或打出一张【杀】时，你可以令其他蜀势力角色打出一张【杀】（视为由你使用或打出）。',
  lord: true
};

SKILLS.wusheng = {
  name: '武圣', desc: '你可以将一张红色牌当【杀】使用或打出。',
  viewAs(p, card) {
    if (!isRed(card)) return [];
    if (isShaId(card.id)) return [];
    return [{ id: 'sha', label: '杀' }];
  }
};

SKILLS.paoxiao = { name: '咆哮', desc: '锁定技，出牌阶段，你使用【杀】无次数限制。', lock: true };

SKILLS.guanxing = {
  name: '观星', desc: '准备阶段，你可以观看牌堆顶的X张牌（X为存活角色数且至多为5），然后以任意顺序置于牌堆顶或牌堆底。',
  async preparePhase(p) {
    if (!(await confirm(p, '是否发动【观星】？', 'guanxing'))) return;
    const n = Math.min(5, alivePlayers().length);
    const cards = [];
    for (let i = 0; i < n; i++) { const c = drawOne(); if (c) cards.push(c); }
    if (!cards.length) return;
    let top = cards, bottom = [];
    if (!p.isAI) {
      const r = await ask(p, { kind: 'arrange', cards: cards.slice(), prompt: '选择置于牌堆顶的牌（按点击顺序从顶往下），其余置于牌堆底' });
      if (r) { top = r.top || cards; bottom = r.bottom || []; }
    }
    // 放入牌堆：top 的第一张在顶部
    for (let i = bottom.length - 1; i >= 0; i--) G.deck.unshift(bottom[i]);
    for (let i = top.length - 1; i >= 0; i--) G.deck.push(top[i]);
    log(`${p.name} 发动【观星】`, 'skill');
    if (p.isAI) return;
  }
};

SKILLS.kongcheng = { name: '空城', desc: '锁定技，若你没有手牌，你不能成为【杀】或【决斗】的目标。', lock: true };

SKILLS.longdan = {
  name: '龙胆', desc: '你可以将一张【杀】当【闪】、一张【闪】当【杀】使用或打出。',
  viewAs(p, card) {
    if (card.id === 'sha') return [{ id: 'shan', label: '闪' }];
    if (card.id === 'shan') return [{ id: 'sha', label: '杀' }];
    return [];
  }
};

SKILLS.mashu = { name: '马术', desc: '锁定技，你计算与其他角色的距离-1。', lock: true };

SKILLS.tieji = {
  name: '铁骑', desc: '当你使用【杀】指定目标后，你可以进行判定：若结果为红色，该角色不能使用【闪】响应此【杀】。',
  lock: false
};

SKILLS.jizhi = {
  name: '集智', desc: '当你使用非延时锦囊牌时，你可以摸一张牌。',
  async onUseCard(p, ctx) {
    if (!isTrick(ctx.asId) || isDelay(ctx.asId)) return;
    if (!(await trySkill(p, 'jizhi'))) return;
    drawCards(p, 1);
    log(`${p.name} 发动【集智】摸一张牌`, 'skill');
    if (typeof UI !== 'undefined') UI.render();
  }
};

SKILLS.qicai = { name: '奇才', desc: '锁定技，你使用锦囊牌无距离限制。', lock: true };

/* ============================================================
 *  吴
 * ============================================================ */

SKILLS.zhiheng = {
  name: '制衡', desc: '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。',
  active: true, limit: true,
  async active(p) {
    const all = cardsOf(p);
    if (!all.length) return false;
    const r = await ask(p, { kind: 'discard', min: 1, max: all.length, prompt: '选择要弃置的牌（弃几张摸几张）', cancelable: true, pool: all });
    if (!r || !r.cards || !r.cards.length) return false;
    const n = r.cards.length;
    discardCards(p, r.cards);
    drawCards(p, n);
    log(`${p.name} 发动【制衡】弃置 ${n} 张牌并摸 ${n} 张牌`, 'skill');
    if (typeof UI !== 'undefined') UI.render();
    return true;
  }
};

SKILLS.jiuyuan = { name: '救援', desc: '主公技，锁定技，其他吴势力角色对你使用【桃】时，你额外回复1点体力。', lock: true, lord: true };

SKILLS.qixi = {
  name: '奇袭', desc: '你可以将一张黑色牌当【过河拆桥】使用。',
  viewAs(p, card) {
    if (!isBlack(card)) return [];
    return [{ id: 'guohe', label: '过河拆桥' }];
  }
};

SKILLS.keji = { name: '克己', desc: '若你于出牌阶段内未使用或打出过【杀】，你可以跳过弃牌阶段。', lock: false };

SKILLS.kurou = {
  name: '苦肉', desc: '出牌阶段，你可以失去1点体力，然后摸两张牌。',
  active: true,
  async active(p) {
    if (p.hp <= 0) return false;
    loseHp(p, 1);
    drawCards(p, 2);
    log(`${p.name} 发动【苦肉】`, 'skill');
    if (typeof UI !== 'undefined') UI.render();
    if (p.hp <= 0) await dying(p, null);
    return true;
  }
};

SKILLS.yingzi = {
  name: '英姿', desc: '摸牌阶段，你可以多摸一张牌。',
  async modifyDraw(p, ctx) {
    if (!(await confirm(p, '是否发动【英姿】多摸一张牌？', 'yingzi'))) return ctx.n;
    return ctx.n + 1;
  }
};

SKILLS.fanjian = {
  name: '反间', desc: '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后获得你的一张手牌并展示之，若花色不同，你对其造成1点伤害。',
  active: true, limit: true,
  async active(p) {
    if (!p.hand.length) return false;
    const t = (await chooseTarget(p, alivePlayers().filter(x => x !== p), 1, '选择一名角色进行反间'))[0];
    if (!t) return false;
    const card = p.hand[Math.floor(Math.random() * p.hand.length)];
    const r = await ask(t, { kind: 'suit', prompt: `${p.name} 发动【反间】，请选择一种花色` });
    const suit = (r && r.suit) || 's';
    removeCardAnywhere(p, card);
    t.hand.push(card);
    log(`${p.name} 对 ${t.name} 发动【反间】，展示 ${cardText(card)}（其选择了${SUIT_CN[suit]}）`, 'skill');
    if (typeof UI !== 'undefined') UI.render();
    if (card.suit !== suit) await damage(p, t, 1, null, null);
    return true;
  }
};

SKILLS.guose = {
  name: '国色', desc: '你可以将一张方块牌当【乐不思蜀】使用。',
  viewAs(p, card) {
    if (card.suit !== 'd') return [];
    return [{ id: 'lebu', label: '乐不思蜀' }];
  }
};

SKILLS.liuli = {
  name: '流离', desc: '当你成为【杀】的目标时，你可以弃置一张牌，将此【杀】转移给你攻击范围内的另一名角色（不能是此【杀】的使用者）。',
  async onTargeted(p, ctx) {
    if (!isShaId(ctx.asId)) return;
    const card = ctx.card;
    // 同一目标只转一次；多次流离之间用 _divertCount 限流
    if ((card._divertCount || 0) >= 3) return;
    if (card._divertedFrom && card._divertedFrom[p.seat]) return;
    const pool = p.hand;
    if (!pool.length) return;
    // 转移对象必须在自己的攻击范围内，且不是【杀】的使用者 / 已经结算过的目标
    const cands = alivePlayers().filter(x => x !== p && x !== ctx.source && x.alive && inAttackRange(p, x)
      && !(card._handled && card._handled[x.seat]));
    if (!cands.length) { log(`${p.name} 的【流离】没有可转移的目标`, 'dim'); return; }
    if (!(await confirm(p, '是否发动【流离】转移此【杀】？', 'liuli'))) return;
    const t = p.isAI ? weakestOf(cands) : (await chooseTarget(p, cands, 1, '选择【流离】的转移目标', true))[0];
    if (!t) return;
    const r = await ask(p, { kind: 'discard', min: 1, max: 1, pool, prompt: '弃置一张牌发动【流离】' });
    const c = (r && r.cards && r.cards[0]) || null;
    if (!c) return;                       // 放弃弃牌 → 技能不发动
    discardCards(p, [c]);
    // 记录本次「谁把杀转给了谁」：本体不再对原目标结算，但新目标要正常结算
    card._divertedFrom = card._divertedFrom || {};
    card._divertedFrom[p.seat] = t;
    card._divertCount = (card._divertCount || 0) + 1;
    log(`${p.name} 发动【流离】，将【杀】转移给 ${t.name}`, 'skill');
    if (typeof UI !== 'undefined') UI.render();
    await shaAgainst(ctx.source, card, ctx.asId, t, natureOf(ctx.asId), ctx.opts || {});
  }
};

SKILLS.qianxun = { name: '谦逊', desc: '锁定技，你不能成为【顺手牵羊】和【乐不思蜀】的目标。', lock: true };
SKILLS.lianying = { name: '连营', desc: '当你失去最后的手牌时，你可以摸一张牌。', lock: true, auto: true };

SKILLS.jieyin = {
  name: '结姻', desc: '出牌阶段限一次，你可以弃置两张手牌，令一名已受伤的男性角色与你各回复1点体力。',
  active: true, limit: true,
  async active(p) {
    if (p.hand.length < 2) return false;
    const cands = alivePlayers().filter(x => x !== p && x.sex === 'm' && x.hp < x.maxHp);
    if (!cands.length) return false;
    const t = (await chooseTarget(p, cands, 1, '选择一名已受伤的男性角色'))[0];
    if (!t) return false;
    const r = await ask(p, { kind: 'discard', min: 2, max: 2, prompt: '弃置两张手牌发动【结姻】' });
    discardCards(p, (r && r.cards) || p.hand.slice(0, 2));
    await heal(t, 1); await heal(p, 1);
    log(`${p.name} 对 ${t.name} 发动【结姻】`, 'skill');
    return true;
  }
};

SKILLS.xiaoji = { name: '枭姬', desc: '当你失去装备区里的一张牌后，你可以摸两张牌。', lock: true, auto: true };

/* ============================================================
 *  群
 * ============================================================ */

SKILLS.jijiu = {
  name: '急救', desc: '你的回合外，你可以将一张红色牌当【桃】使用。',
  viewAs(p, card) {
    if (!isRed(card)) return [];
    if (G.players[G.current] === p) return [];
    return [{ id: 'tao', label: '桃' }];
  }
};

SKILLS.qingnang = {
  name: '青囊', desc: '出牌阶段限一次，你可以弃置一张手牌，令一名已受伤的角色回复1点体力。',
  active: true, limit: true,
  async active(p) {
    if (!p.hand.length) return false;
    const cands = alivePlayers().filter(x => x.hp < x.maxHp);
    if (!cands.length) return false;
    const t = (await chooseTarget(p, cands, 1, '选择一名已受伤的角色'))[0];
    if (!t) return false;
    const r = await ask(p, { kind: 'discard', min: 1, max: 1, prompt: '弃置一张手牌发动【青囊】' });
    discardCards(p, (r && r.cards) || [p.hand[0]]);
    await heal(t, 1);
    log(`${p.name} 对 ${t.name} 发动【青囊】`, 'skill');
    return true;
  }
};

SKILLS.wushuang = { name: '无双', desc: '锁定技，当你使用【杀】指定目标后，该角色需依次使用两张【闪】；当你使用【决斗】或成为【决斗】目标后，对方需依次打出两张【杀】。', lock: true };

SKILLS.lijian = {
  name: '离间', desc: '出牌阶段限一次，你可以弃置一张牌并选择两名男性角色，视为其中一名对另一名使用【决斗】。',
  active: true, limit: true,
  async active(p) {
    if (!cardsOf(p).length) return false;
    const males = alivePlayers().filter(x => x.sex === 'm' && x !== p);
    if (males.length < 2) return false;
    const ts = await chooseTarget(p, males, 2, '选择两名男性角色');
    if (!ts || ts.length < 2) return false;
    const r = await ask(p, { kind: 'discard', min: 1, max: 1, prompt: '弃置一张牌发动【离间】' });
    discardCards(p, (r && r.cards) || [cardsOf(p)[0]]);
    log(`${p.name} 发动【离间】，${ts[0].name} 与 ${ts[1].name} 决斗`, 'skill');
    const vc = makeVirtual('juedou');
    await resolveJuedou(ts[0], vc, ts[1]);
    return true;
  }
};

SKILLS.biyue = {
  name: '闭月', desc: '结束阶段，你可以摸一张牌。',
  async turnEnd(p) {
    if (!(await trySkill(p, 'biyue'))) return;
    drawCards(p, 1);
    log(`${p.name} 发动【闭月】摸一张牌`, 'skill');
  }
};

/* ============================================================
 *  军争篇
 * ============================================================ */

SKILLS.xingshang = {
  name: '行殇', desc: '当其他角色死亡时，你可以获得其所有牌。',
  async onDeath(p, ctx) {
    const dead = ctx.player || ctx.target;
    if (!dead || dead === p || dead.alive) return;
    const all = cardsOf(dead);
    if (!all.length) return;
    if (!(await trySkill(p, 'xingshang'))) return;
    all.forEach(c => { removeCardAnywhere(dead, c); p.hand.push(c); });
    log(`${p.name} 发动【行殇】获得了 ${dead.name} 的所有牌`, 'skill');
  }
};

SKILLS.fangzhu = {
  name: '放逐', desc: '当你受到伤害后，你可以令一名其他角色摸X张牌（X为你已损失的体力值），然后其将武将牌翻面。',
  async afterDamage(p, ctx) {
    const x = p.maxHp - p.hp;
    if (x <= 0) return;
    const cands = alivePlayers().filter(q => q !== p);
    if (!cands.length) return;
    if (!(await trySkill(p, 'fangzhu'))) return;
    const t = p.isAI ? cands[0] : (await chooseTarget(p, cands, 1, '选择一名角色放逐'))[0];
    if (!t) return;
    drawCards(t, x);
    t.flipped = true;
    log(`${p.name} 发动【放逐】，${t.name} 摸 ${x} 张牌并翻面`, 'skill');
    if (typeof UI !== 'undefined') UI.render();
  }
};

SKILLS.songwei = {
  name: '颂威', desc: '主公技。其他魏势力角色的判定牌为黑色且生效后，你可以摸一张牌。',
  lord: true,
  async afterOtherJudge(p, ctx) {
    if (!ctx.card || ctx.card.suit !== 's' && ctx.card.suit !== 'c') return;
    if (ctx.target === p || ctx.target.kingdom !== 'wei') return;
    if (!(await trySkill(p, 'songwei'))) return;
    drawCards(p, 1);
    log(`${p.name} 发动【颂威】摸一张牌`, 'skill');
  }
};

SKILLS.duanliang = {
  name: '断粮', desc: '你可以将一张黑色基本牌或黑色装备牌当【兵粮寸断】使用。',
  viewAs(p, card) {
    if (!isBlack(card)) return [];
    const info = CARD_INFO[card.id];
    if (info.type !== 'basic' && info.type !== 'equip') return [];
    return [{ id: 'bingliang', label: '兵粮寸断' }];
  }
};

SKILLS.huoshou = { name: '祸首', desc: '锁定技，【南蛮入侵】对你无效；当其他角色使用【南蛮入侵】时，你获得之。', lock: true };

SKILLS.zaiqi = {
  name: '再起', desc: '摸牌阶段，若你已受伤，你可以改为亮出牌堆顶的X张牌，其中每有一张红桃牌，你回复1点体力，然后获得所有红桃牌。',
  async modifyDraw(p, ctx) {
    if (p.hp >= p.maxHp) return ctx.n;
    if (!(await confirm(p, '是否发动【再起】？', 'zaiqi'))) return ctx.n;
    const x = Math.min(p.maxHp - p.hp, 3);
    const cards = [];
    for (let i = 0; i < x; i++) { const c = drawOne(); if (c) cards.push(c); }
    log(`${p.name} 发动【再起】亮出：${cards.map(cardText).join('，')}`, 'skill');
    const hearts = cards.filter(c => c.suit === 'h');
    hearts.forEach(c => { p.hand.push(c); });
    cards.filter(c => c.suit !== 'h').forEach(c => toDiscard(c));
    if (hearts.length) await heal(p, hearts.length);
    if (typeof UI !== 'undefined') UI.render();
    return 0;
  }
};

SKILLS.juxiang = { name: '巨象', desc: '锁定技，【南蛮入侵】对你无效；其他角色使用的【南蛮入侵】结算结束后，你获得之。', lock: true };

SKILLS.lieren = {
  name: '烈刃', desc: '当你使用【杀】对目标角色造成伤害后，你可以与其拼点，若你赢，你获得其一张牌。',
  lock: false
};

SKILLS.jiuchi = {
  name: '酒池', desc: '你可以将一张黑桃手牌当【酒】使用。',
  viewAs(p, card) {
    if (card.suit !== 's') return [];
    return [{ id: 'jiu', label: '酒' }];
  }
};

SKILLS.roulin = { name: '肉林', desc: '锁定技，当你使用【杀】指定女性角色为目标后，或女性角色使用【杀】指定你为目标后，其需依次使用两张【闪】。', lock: true };

SKILLS.benghuai = {
  name: '崩坏', desc: '锁定技，结束阶段，若你不是体力值最少的角色，你须减1点体力上限或减1点体力。',
  async turnEnd(p) {
    const alive = alivePlayers();
    const minHp = Math.min(...alive.map(x => x.hp));
    if (p.hp <= minHp) return;
    if (p.isAI) {
      if (p.hp > 3) { p.hp--; p.maxHp--; } else p.maxHp = Math.max(1, p.maxHp - 1);
    } else {
      const r = await ask(p, { kind: 'choice', prompt: '【崩坏】：选择一项', options: [{ id: 'hp', label: '减1点体力' }, { id: 'max', label: '减1点体力上限' }] });
      if (r && r.option === 'hp') p.hp = Math.max(1, p.hp - 1);
      else p.maxHp = Math.max(1, p.maxHp - 1);
    }
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    log(`${p.name} 受到【崩坏】影响`, 'dmg');
    if (typeof UI !== 'undefined') UI.render();
  }
};

SKILLS.wansha = { name: '完杀', desc: '锁定技，你的回合内，不处于濒死状态的其他角色不能使用【桃】。', lock: true };
SKILLS.weimu = { name: '帷幕', desc: '锁定技，你不能成为黑色锦囊牌的目标。', lock: true };

SKILLS.luanwu = {
  name: '乱武', desc: '限定技，出牌阶段，你可以令所有其他角色依次选择一项：1.对与其距离最近的另一名角色使用一张【杀】；2.失去1点体力。',
  active: true, once: true,
  async active(p) {
    p.marks.luanwu = true;
    log(`${p.name} 发动【乱武】！`, 'skill');
    for (const q of seatOrder(p, false)) {
      if (!q.alive) continue;
      const others = alivePlayers().filter(x => x !== q);
      if (!others.length) continue;
      let minD = 99;
      others.forEach(x => { minD = Math.min(minD, distance(q, x)); });
      const nearest = others.filter(x => distance(q, x) === minD);
      // 最近的往往有好几个人；优先挑「手上真有杀能打到」的那个，
      // 否则会提交一个打不到的目标，被引擎拒绝（AI 空转）
      const t = nearest.find(x => x !== p && canShaTarget(q, x))
        || nearest.find(x => canShaTarget(q, x))
        || nearest.find(x => x !== p) || nearest[0];
      if (!t) continue;
      const canSha = (q.shaCount < 1 || hasSkill(q, 'paoxiao')
        || !!(q.equip.weapon && q.equip.weapon.id === 'zhuge'))
        && canShaTarget(q, t);
      const pk = canSha ? await pickShaCards(q,
        `【乱武】：对 ${t.name} 使用一张【杀】，否则失去1点体力`, t) : null;
      // 只有真的把【杀】打出去（且引擎接受）才算完成，否则照样失去体力
      const did = pk ? await useCard(q, pk.cards[0], [t], shaUseOpts(q, pk)) : false;
      if (!did) await loseHp(q, 1);
      if (q.hp <= 0) await dying(q, p);
    }
    return true;
  }
};

SKILLS.haoshi = {
  name: '好施', desc: '摸牌阶段，你可以多摸两张牌，若如此做，摸牌阶段结束时，若你的手牌数大于5，你将一半（向下取整）交给手牌数最少的一名角色。',
  async modifyDraw(p, ctx) {
    if (!(await confirm(p, '是否发动【好施】多摸两张牌？', 'haoshi'))) return ctx.n;
    p.marks.haoshi = true;
    return ctx.n + 2;
  }
};

SKILLS.dimeng = {
  name: '缔盟', desc: '出牌阶段限一次，你可以选择两名其他角色，弃置等同于这两名角色手牌数之差的牌，然后交换他们的手牌。',
  active: true, limit: true,
  async active(p) {
    const others = alivePlayers().filter(x => x !== p);
    if (others.length < 2) return false;
    const ts = await chooseTarget(p, others, 2, '选择两名角色交换手牌');
    if (!ts || ts.length < 2) return false;
    const diff = Math.abs(ts[0].hand.length - ts[1].hand.length);
    if (diff > cardsOf(p).length) { log('牌数不足，无法缔盟', 'dim'); return false; }
    if (diff > 0) {
      const r = await ask(p, { kind: 'discard', min: diff, max: diff, prompt: `弃置 ${diff} 张牌发动【缔盟】` });
      discardCards(p, (r && r.cards) || cardsOf(p).slice(0, diff));
    }
    const a = ts[0].hand.slice(), b = ts[1].hand.slice();
    ts[0].hand = b; ts[1].hand = a;
    log(`${p.name} 发动【缔盟】，交换了 ${ts[0].name} 与 ${ts[1].name} 的手牌`, 'skill');
    if (typeof UI !== 'undefined') UI.render();
    return true;
  }
};

SKILLS.yinghun = {
  name: '英魂', desc: '准备阶段，若你已受伤，你可以选择一名其他角色并选择一项：1.令其摸X张牌，然后弃置一张牌；2.令其摸一张牌，然后弃置X张牌。',
  async preparePhase(p) {
    if (p.hp >= p.maxHp) return;
    const cands = alivePlayers().filter(x => x !== p);
    if (!cands.length) return;
    if (!(await trySkill(p, 'yinghun'))) return;
    const x = p.maxHp - p.hp;
    const t = p.isAI ? cands[0] : (await chooseTarget(p, cands, 1, '选择一名角色'))[0];
    if (!t) return;
    let opt = 'draw';
    if (!p.isAI) {
      const r = await ask(p, { kind: 'choice', prompt: `【英魂】：选择一项（X=${x}）`, options: [{ id: 'draw', label: `令其摸${x}张牌，弃一张牌` }, { id: 'discard', label: `令其摸一张牌，弃${x}张牌` }] });
      opt = (r && r.option) || 'draw';
    }
    if (opt === 'draw') {
      drawCards(t, x);
      const r = await ask(t, { kind: 'discard', min: 1, max: 1, prompt: '弃置一张牌' });
      discardCards(t, (r && r.cards) || (t.hand[0] ? [t.hand[0]] : []));
    } else {
      drawCards(t, 1);
      const need = Math.min(x, t.hand.length);
      if (need > 0) {
        const r = await ask(t, { kind: 'discard', min: need, max: need, prompt: `弃置 ${need} 张牌` });
        discardCards(t, (r && r.cards) || t.hand.slice(0, need));
      }
    }
    log(`${p.name} 对 ${t.name} 发动【英魂】`, 'skill');
  }
};

/* 补：好施的后续（摸牌阶段结束时）由 drawPhase 调用 */
async function afterDrawPhase(p) {
  if (p.marks.haoshi) {
    p.marks.haoshi = false;
    if (p.hand.length > 5) {
      const n = Math.floor(p.hand.length / 2);
      const cands = alivePlayers().filter(x => x !== p);
      if (!cands.length) return;
      let min = Math.min(...cands.map(x => x.hand.length));
      const poor = cands.filter(x => x.hand.length === min);
      const t = p.isAI ? poor[0] : await chooseTarget(p, cands, 1, `【好施】：将 ${n} 张手牌交给手牌最少的角色`);
      const target = (t && t[0]) || poor[0];
      if (!target) return;
      const cards = p.hand.slice(0, n);
      cards.forEach(c => { removeCardAnywhere(p, c); target.hand.push(c); });
      log(`${p.name} 发动【好施】将 ${n} 张牌交给 ${target.name}`, 'skill');
      if (typeof UI !== 'undefined') UI.render();
    }
  }
}

/* 骅骝等装备无需技能 */
