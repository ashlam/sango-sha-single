'use strict';
/* ============================================================
 *  铁索连环：传导条件、重置、铁索自身的使用
 *  规则要点
 *   - 只有【火】【雷】属性伤害会传导，普通伤害不传导
 *   - 横置角色受到属性伤害后须重置（解除横置）
 *   - 传导伤害同样是属性伤害，被传导者也会重置
 * ============================================================ */
const H = require('../skilllib');
const { group, test, eq, ok } = H;

/* 一律不出牌、不发动技能，方便观察纯伤害结果 */
function passive() {
  H.respond({
    respond: () => null,
    save: () => null,
    wuxie: () => null,
    yesno: () => ({ yes: false }),
  });
}

group('铁索连环 · 传导与重置');

test('普通【杀】不会沿铁索传导', async () => {
  const { P, api } = H.game(4);
  const [me, a, b] = P;
  a.flags.chained = true;
  b.flags.chained = true;
  passive();
  const sha = H.give(me, 'sha', 's');
  await api.useCard(me, sha, [a]);
  eq(a.hp, 3, '被杀的甲受 1 点伤害');
  eq(b.hp, 4, '普通伤害不传导，乙不应受伤');
  eq(a.flags.chained, true, '普通伤害不触发重置');
});

test('火【杀】沿铁索传导给另一名横置角色', async () => {
  const { P, api } = H.game(4);
  const [me, a, b] = P;
  a.flags.chained = true;
  b.flags.chained = true;
  passive();
  const hs = H.give(me, 'huosha', 'h');
  await api.useCard(me, hs, [a]);
  eq(a.hp, 3, '甲受 1 点火伤害');
  eq(b.hp, 3, '乙应受到同量传导伤害');
});

test('雷【杀】同样传导', async () => {
  const { P, api } = H.game(4);
  const [me, a, b] = P;
  a.flags.chained = true;
  b.flags.chained = true;
  passive();
  const ls = H.give(me, 'leisha', 's');
  await api.useCard(me, ls, [a]);
  eq(a.hp, 3);
  eq(b.hp, 3, '雷伤害也应传导');
});

test('未横置的角色不参与传导', async () => {
  const { P, api } = H.game(4);
  const [me, a, b, c] = P;
  a.flags.chained = true;
  b.flags.chained = true;
  passive();
  const hs = H.give(me, 'huosha', 'h');
  await api.useCard(me, hs, [a]);
  eq(b.hp, 3);
  eq(c.hp, 4, '丙未横置，不应受伤');
});

test('受到属性伤害后，双方都会重置', async () => {
  const { P, api } = H.game(4);
  const [me, a, b] = P;
  a.flags.chained = true;
  b.flags.chained = true;
  passive();
  const hs = H.give(me, 'huosha', 'h');
  await api.useCard(me, hs, [a]);
  eq(a.flags.chained, false, '甲受到属性伤害后应重置');
  eq(b.flags.chained, false, '被传导的乙也应重置');
});

test('重置后再受属性伤害，不会继续传导', async () => {
  const { P, api } = H.game(4);
  const [me, a, b] = P;
  a.flags.chained = true;
  b.flags.chained = true;
  passive();
  const s1 = H.give(me, 'huosha', 'h');
  await api.useCard(me, s1, [a]);
  eq(b.hp, 3);
  // 第二次：两人都已重置，不应再传导
  me.shaCount = 0;
  const s2 = H.give(me, 'huosha', 'h');
  await api.useCard(me, s2, [a]);
  eq(a.hp, 2, '甲再受 1 点');
  eq(b.hp, 3, '乙已重置，不应再受伤');
});

test('铁索连环：横置两名目标，再对同一目标使用则重置', async () => {
  const { P, api } = H.game(4);
  const [me, a, b] = P;
  passive();
  const t1 = H.give(me, 'tiesuo');
  await api.useCard(me, t1, [a, b]);
  eq(a.flags.chained, true, '甲应被横置');
  eq(b.flags.chained, true, '乙应被横置');
  const t2 = H.give(me, 'tiesuo');
  await api.useCard(me, t2, [a]);
  eq(a.flags.chained, false, '对已横置角色再用铁索，应重置');
  eq(b.flags.chained, true, '未指定的乙保持横置');
});

test('传导链最多传一轮（三人横置不会重复结算）', async () => {
  const { P, api } = H.game(4);
  const [me, a, b, c] = P;
  a.flags.chained = true;
  b.flags.chained = true;
  c.flags.chained = true;
  passive();
  const hs = H.give(me, 'huosha', 'h');
  await api.useCard(me, hs, [a]);
  eq(a.hp, 3, '甲 1 点');
  eq(b.hp, 3, '乙 1 点');
  eq(c.hp, 3, '丙 1 点');
  eq([a, b, c].every(p => !p.flags.chained), true, '三人都应重置');
});

group('铁索连环 · 重铸');

test('重铸：弃置铁索并摸一张牌', async () => {
  const { P, api, G } = H.game(4);
  const me = P[0];
  const ts = H.give(me, 'tiesuo');
  H.give(me, 'sha');
  H.deckTop('shan');
  const before = me.hand.length;
  const okRecast = await api.recastCard(me, ts);
  eq(okRecast, true, '重铸应成功');
  eq(me.hand.length, before, '弃一张摸一张，手牌数不变');
  eq(H.hasUid(me, ts.uid), false, '铁索应离开手牌');
  ok(G.discard.some(c => c.uid === ts.uid), '铁索应进弃牌堆');
  ok(me.hand.some(c => c.id === 'shan'), '应摸到牌堆顶的【闪】');
});

test('重铸：不能用于非「可重铸」牌', async () => {
  const { P, api, G } = H.game(4);
  const me = P[0];
  const sha = H.give(me, 'sha');
  H.deckTop('shan');
  const okRecast = await api.recastCard(me, sha);
  eq(okRecast, false, '普通【杀】不能重铸');
  eq(me.hand.length, 1, '手牌不变');
  eq(G.discard.length, 0, '弃牌堆不应有牌');
});

group('AI · 铁索连环重铸');

test('AI：没有可横置的敌人时重铸铁索', async () => {
  const { P, api, G } = H.game(4);
  P[0].identity = 'lord';
  P[1].identity = 'rebel';
  P[2].identity = 'rebel';
  P[3].identity = 'rebel';
  const me = P[1];
  me.isAI = true;
  G.current = 1;
  P[0].flags.chained = true;      // 唯一的敌人已经横置
  H.give(me, 'tiesuo');
  H.giveMany(me, 3, 'shan');
  const r = await api.AI.decide(me, { kind: 'play', options: [] });
  eq(r.action, 'recast');
  eq(r.card.id, 'tiesuo');
});
