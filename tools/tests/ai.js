'use strict';
/* 六、AI 决策：别把牌浪费在打不动的人身上 */
const H = require('../skilllib');
const { test, group, game, give, giveMany, equip, ok, eq, eqArr } = H;

/* 构造一个「1 号位是反贼，0/2/3 位是主公阵营」的局面 */
function arena(n) {
  const ctx = game(n || 4);
  const { P } = ctx;
  P[0].identity = 'lord';        // 唯一的敌人
  P[1].identity = 'rebel';       // 被测试的 AI
  for (let i = 2; i < P.length; i++) P[i].identity = 'rebel';   // 其余都是友军
  P[1].isAI = true;
  P[1].hp = P[1].maxHp = 4;
  ctx.G.current = 1;
  return ctx;
}

function decide(api, p) {
  return api.AI.decide(p, { kind: 'play', options: [] });
}

group('AI · 防具识别');

test('AI：敌人穿藤甲时不会用普通【杀】', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  equip(P[0], 'tengjia');
  give(me, 'sha');
  const r = await decide(api, me);
  ok(!(r && r.action === 'use' && r.card.id === 'sha'), '不该对藤甲用普通杀，实际：' + JSON.stringify(r && r.card && r.card.id));
});

test('AI：敌人穿藤甲时优先改用【火杀】', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  equip(P[0], 'tengjia');
  give(me, 'sha');
  give(me, 'huosha', 'h');
  const r = await decide(api, me);
  eq(r.action, 'use');
  eq(r.card.id, 'huosha', '应选择火杀');
  eq(r.targets[0], P[0], '目标应还是那个敌人');
});

test('AI：只有普通【杀】时干脆不出', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  equip(P[0], 'tengjia');
  give(me, 'sha');
  // 另外两个方向也没有敌人（都是忠臣）
  const r = await decide(api, me);
  ok(!(r && r.action === 'use' && r.card.id === 'sha'), '不该硬打');
});

test('AI：一个敌人穿藤甲、一个没穿，就换人打', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  P[2].identity = 'loyal';      // 2 号位也是敌人
  equip(P[0], 'tengjia');
  give(me, 'sha');
  const r = await decide(api, me);
  eq(r.action, 'use');
  eq(r.card.id, 'sha');
  eq(r.targets[0], P[2], '应改打没穿藤甲的那个敌人');
});

test('AI：穿仁王盾的敌人，黑【杀】不打', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  equip(P[0], 'renwang');
  give(me, 'sha', 's');          // 黑桃
  const r = await decide(api, me);
  ok(!(r && r.action === 'use' && r.card.id === 'sha'), '黑杀对仁王盾无效，不该打');
});

test('AI：敌人都有藤甲时不用【南蛮入侵】', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  equip(P[0], 'tengjia');
  P[2].identity = 'loyal';
  equip(P[2], 'tengjia');
  give(me, 'nanman');
  giveMany(me, 3, 'shan');       // 让手牌够多，排除「手牌不够」的干扰
  const r = await decide(api, me);
  ok(!(r && r.action === 'use' && r.card.id === 'nanman'), '南蛮对藤甲无效，不该打');
});

test('AI：敌人都有藤甲时不用【万箭齐发】', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  equip(P[0], 'tengjia');
  P[2].identity = 'loyal';
  equip(P[2], 'tengjia');
  give(me, 'wanjian');
  giveMany(me, 3, 'shan');
  const r = await decide(api, me);
  ok(!(r && r.action === 'use' && r.card.id === 'wanjian'), '万箭对藤甲无效，不该打');
});

test('AI：敌人没防具时照常出【杀】', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  give(me, 'sha');
  const r = await decide(api, me);
  eq(r.action, 'use');
  eq(r.card.id, 'sha');
});

group('AI · 出牌规则');

test('AI：本回合出过【杀】之后不会重复提交', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  me.shaCount = 1;
  give(me, 'sha');
  const r = await decide(api, me);
  ok(!(r && r.action === 'use' && r.card.id === 'sha'), '没有咆哮/连弩时不该再出杀');
});

test('AI：有咆哮时回合内继续出【杀】', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  me.shaCount = 1;
  me.skills = ['paoxiao'];
  give(me, 'sha');
  const r = await decide(api, me);
  eq(r.action, 'use');
  eq(r.card.id, 'sha');
});

test('AI：体力不满时优先吃【桃】', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  me.hp = 2;
  give(me, 'tao');
  give(me, 'sha');
  const r = await decide(api, me);
  eq(r.card.id, 'tao');
});

test('AI：不会对队友出【杀】', async () => {
  const { P, api } = arena(4);
  const me = P[1];
  P[0].identity = 'rebel';       // 全场都是反贼（无敌人）
  P[2].identity = 'rebel';
  P[3].identity = 'rebel';
  give(me, 'sha');
  const r = await decide(api, me);
  ok(!(r && r.action === 'use' && r.card.id === 'sha'), '队友不该打');
});

group('AI · 防具免疫判断');

test('armorImmune：藤甲挡住普通杀、南蛮、万箭', () => {
  const { P, api } = arena(4);
  equip(P[0], 'tengjia');
  eq(api.armorImmune(P[0], 'sha'), true);
  eq(api.armorImmune(P[0], 'nanman'), true);
  eq(api.armorImmune(P[0], 'wanjian'), true);
  eq(api.armorImmune(P[0], 'huosha'), false, '火杀能打');
  eq(api.armorImmune(P[0], 'leisha'), false, '雷杀能打');
});

test('armorImmune：其他防具不提供这类免疫', () => {
  const { P, api } = arena(4);
  equip(P[0], 'bagua');
  eq(api.armorImmune(P[0], 'sha'), false);
  eq(api.armorImmune(P[0], 'nanman'), false);
});

group('AI · 自战集成');

/* 跑一局 AI 对 AI，统计被引擎拒绝的动作 */
function aiGame(api, n) {
  api.newGame({ playerCount: n });
  const G = api.G;
  const used = [];
  G.players.forEach(p => {
    const cands = api.GENERALS.filter(g => !used.includes(g.id));
    const g = cands[Math.floor(Math.random() * cands.length)];
    used.push(g.id);
    Object.assign(p, {
      generalId: g.id, general: g.name, name: g.name, kingdom: g.kingdom,
      sex: g.sex, maxHp: g.hp, hp: g.hp, skills: g.skills.slice(), isAI: true,
    });
  });
  const lord = G.players.find(p => p.identity === 'lord');
  if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }
  api.buildDeck();
  G.players.forEach(p => api.drawCards(p, 4));
  G.current = lord ? lord.seat : 0;
  G.responder = (p, req) => api.AI.decide(p, req);
  return G;
}

test('AI 自战 3 局：没有一次「想做的事做不了」', async () => {
  const api = H.load();
  const ctx = api._ctx;
  const origUse = ctx.useCard, origSkill = ctx.useActiveSkill;
  let rejected = 0;
  const detail = [];
  const snap = (type, a) => {
    const user = a[0], card = a[1], opts = a[3] || {};
    const asId = (type === 'use' ? (opts.asId || (card && card.id)) : a[1]);
    detail.push(`${type} ${asId} by ${user && user.name}（阶段 ${ctx.G.phase}，`
      + `当前 ${ctx.G.players[ctx.G.current] && ctx.G.players[ctx.G.current].name}，`
      + `目标 ${(a[2] || []).map(t => t && t.name).join('/') || '无'}，`
      + `合法 ${(type === 'use' ? ctx.validTargets(user, asId, card) : []).map(t => t.name).join('/') || '无'}）`);
  };
  ctx.useCard = async (...a) => { const r = await origUse(...a); if (!r) { rejected++; snap('use', a); } return r; };
  ctx.useActiveSkill = async (...a) => { const r = await origSkill(...a); if (!r) { rejected++; snap('skill', a); } return r; };
  let over = false;
  try {
    for (let i = 0; i < 3; i++) {
      const G = aiGame(api, 8);
      const done = api.gameLoop();
      const guard = new Promise((_, rej) => setTimeout(() => rej(new Error('对局超时未结束')), 20000));
      await Promise.race([done, guard]);
      over = over || G.over;
    }
  } finally {
    ctx.useCard = origUse;
    ctx.useActiveSkill = origSkill;
  }
  ok(over, '至少应有一局正常结束');
  eq(rejected, 0, `AI 提交了 ${rejected} 次无法执行的动作：\n      ${detail.join('\n      ')}`);
});

group('AI · 铁索连环');

test('AI：铁索连环一次横置两名敌人', async () => {
  const { P, api, G } = game(4);
  const me = P[1];
  P[0].identity = 'lord';   // 敌人
  P[1].identity = 'rebel';
  P[2].identity = 'loyal';  // 敌人
  P[3].identity = 'loyal';  // 敌人
  me.isAI = true;
  G.current = 1;
  give(me, 'tiesuo');
  giveMany(me, 3, 'shan');
  const r = await decide(api, me);
  eq(r.action, 'use');
  eq(r.card.id, 'tiesuo');
  eq(r.targets.length, 2, '应同时横置两名敌人');
  ok(r.targets.every(t => t !== me), '不应横置自己');
});

test('AI：只剩一名未横置敌人时，铁索只连一个', async () => {
  const { P, api, G } = game(4);
  const me = P[1];
  P[0].identity = 'lord';
  P[1].identity = 'rebel';
  P[2].identity = 'loyal';
  P[3].identity = 'loyal';
  P[3].flags.chained = true;   // 已横置
  P[2].flags.chained = true;
  me.isAI = true;
  G.current = 1;
  give(me, 'tiesuo');
  giveMany(me, 3, 'shan');
  const r = await decide(api, me);
  eq(r.action, 'use');
  eq(r.targets.length, 1);
  eq(r.targets[0], P[0]);
});
