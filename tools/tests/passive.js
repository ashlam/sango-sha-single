'use strict';
/* 二、锁定技与被动技 */
const H = require('../skilllib');
const { test, group, game, give, giveMany, equip, deckTop, ok, eq, eqArr, ne } = H;

const noShan = () => H.respond({ respond: () => null });

group('锁定技 · 出杀与目标');

test('咆哮：一回合内可以连续使用【杀】', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['paoxiao'];
  noShan();
  const s1 = give(me, 'sha'), s2 = give(me, 'sha');
  eq(await api.useCard(me, s1, [foe], { asId: 'sha' }), true, '第一张杀');
  eq(await api.useCard(me, s2, [foe], { asId: 'sha' }), true, '第二张杀应允许');
  eq(foe.hp, 2, '应受到 2 点伤害');
});

test('没有咆哮时，一回合只能用一张【杀】', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  noShan();
  const s1 = give(me, 'sha'), s2 = give(me, 'sha');
  eq(await api.useCard(me, s1, [foe], { asId: 'sha' }), true);
  eq(await api.useCard(me, s2, [foe], { asId: 'sha' }), false, '第二张应被拒绝');
  eq(foe.hp, 3);
});

test('诸葛连弩同样允许无限出【杀】', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  equip(me, 'zhuge');
  noShan();
  const s1 = give(me, 'sha'), s2 = give(me, 'sha');
  eq(await api.useCard(me, s1, [foe], { asId: 'sha' }), true);
  eq(await api.useCard(me, s2, [foe], { asId: 'sha' }), true);
  eq(foe.hp, 2);
});

test('空城：没有手牌时不能成为【杀】和【决斗】的目标', () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  foe.skills = ['kongcheng'];
  foe.hand = [];
  const sha = H.mk('sha', 's');
  ok(!api.validTargets(me, 'sha', sha).includes(foe), '空城不应成为杀的目标');
  ok(!api.validTargets(me, 'juedou', H.mk('juedou')).includes(foe), '空城不应成为决斗的目标');
  give(foe, 'tao');
  ok(api.validTargets(me, 'sha', sha).includes(foe), '有手牌后可以成为目标');
});

test('马术：计算与其他角色的距离 -1', () => {
  const { P, api } = game(5);
  const me = P[0];
  eq(api.distance(me, P[3]), 2, '基础距离');
  me.skills = ['mashu'];
  eq(api.distance(me, P[3]), 1, '马术后距离');
});

test('奇才：使用锦囊无距离限制', () => {
  const { P, api } = game(5);
  const me = P[0], far = P[3];
  give(far, 'sha');
  const shun = H.mk('shunshou', 's');
  ok(!api.validTargets(me, 'shunshou', shun).includes(far), '距离 2 时【顺手牵羊】不合法');
  me.skills = ['qicai'];
  ok(api.validTargets(me, 'shunshou', shun).includes(far), '【奇才】后应无距离限制');
});

test('谦逊：不能成为【顺手牵羊】与【乐不思蜀】的目标', () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  give(foe, 'sha');
  foe.skills = ['qianxun'];
  ok(!api.validTargets(me, 'shunshou', H.mk('shunshou')).includes(foe));
  ok(!api.validTargets(me, 'lebu', H.mk('lebu')).includes(foe));
});

test('帷幕：不能成为黑色锦囊的目标，红色可以', () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  give(foe, 'sha');
  foe.skills = ['weimu'];
  ok(!api.validTargets(me, 'guohe', H.mk('guohe', 's')).includes(foe), '黑色【过河拆桥】不可');
  ok(api.validTargets(me, 'guohe', H.mk('guohe', 'h')).includes(foe), '红色【过河拆桥】可以');
});

group('锁定技 · 伤害与响应');

test('无双：目标需要两张【闪】', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['wushuang'];
  const shan = give(foe, 'shan');
  let used = false;
  H.respond({ respond: (p) => (p === foe && !used ? (used = true, { card: shan }) : null) });
  await api.useCard(me, give(me, 'sha'), [foe], { asId: 'sha' });
  eq(foe.hp, 3, '只有一张闪，仍应受伤');
  ok(!H.hasUid(foe, shan.uid), '那张【闪】应被消耗');
});

test('肉林：女性角色对男性使用【杀】时对方需两张【闪】', async () => {
  const { P, api } = game(4);
  const she = P[0], foe = P[1];
  she.sex = 'f';
  foe.skills = ['roulin'];
  const shan = give(foe, 'shan');
  let used = false;
  H.respond({ respond: (p) => (p === foe && !used ? (used = true, { card: shan }) : null) });
  await api.useCard(she, give(she, 'sha'), [foe], { asId: 'sha' });
  eq(foe.hp, 3, '一张闪不够，应受伤');
});

test('藤甲：普通【杀】无效，火【杀】伤害+1', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  equip(foe, 'tengjia');
  noShan();
  ok(!api.validTargets(me, 'sha', H.mk('sha')).includes(foe), '普通杀不该能选藤甲目标');
  const r = await api.useCard(me, give(me, 'sha'), [foe], { asId: 'sha' });
  ok(!r, '强行指定普通杀应被拒绝');
  eq(foe.hp, 4, '普通杀对藤甲无效');
  await api.useCard(me, give(me, 'huosha', 'h'), [foe], { asId: 'huosha' });
  eq(foe.hp, 2, '火杀 1 + 藤甲 1 = 2 点伤害');
});

test('仁王盾：黑色【杀】无效，红色【杀】有效', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  equip(foe, 'renwang');
  noShan();
  await api.useCard(me, give(me, 'sha', 's'), [foe], { asId: 'sha' });
  eq(foe.hp, 4, '黑杀应被仁王盾抵消');
  await api.useCard(me, give(me, 'sha', 'h'), [foe], { asId: 'sha' });
  eq(foe.hp, 3, '红杀应命中');
});

test('青釭剑：无视仁王盾与藤甲', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  equip(me, 'qinggang');
  equip(foe, 'renwang');
  noShan();
  await api.useCard(me, give(me, 'sha', 's'), [foe], { asId: 'sha' });
  eq(foe.hp, 3, '青釭剑应无视仁王盾');
  foe.equip.armor = null;
  equip(foe, 'tengjia');
  me.shaCount = 0;
  await api.useCard(me, give(me, 'sha', 's'), [foe], { asId: 'sha' });
  eq(foe.hp, 2, '青釭剑应无视藤甲');
});

test('铁骑：判定为红色时目标不能使用【闪】', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['tieji'];
  const shan = give(foe, 'shan');
  deckTop({ id: 'tao', suit: 'h' });  // 判定牌：红桃
  H.respond({
    yesno: () => ({ yes: true }),
    respond: (p) => (p === foe ? { card: shan } : null),
  });
  await api.useCard(me, give(me, 'sha'), [foe], { asId: 'sha' });
  eq(foe.hp, 3, '不能出闪，应受伤');
  ok(H.hasUid(foe, shan.uid), '【闪】不该被消耗');
});

group('锁定技 · 回合流程');

test('克己：出牌阶段未出【杀】可跳过弃牌阶段', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  me.skills = ['keji'];
  me.hp = 2;
  giveMany(me, 5, 'shan');
  G.current = 0;
  await api.discardPhase(me);
  eq(me.hand.length, 5, '应该跳过弃牌，手牌不变');
});

test('克己：本回合出过【杀】则不能跳过', async () => {
  const { G, P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['keji'];
  me.hp = 2;
  giveMany(me, 4, 'shan');
  give(me, 'sha');
  G.current = 0;
  G.phase = 'play';                      // 克己只看「出牌阶段内」是否用过杀
  H.respond({ respond: () => null });
  await api.useCard(me, me.hand.find(c => c.id === 'sha'), [foe], { asId: 'sha' });
  H.respond({ respond: () => null });
  await api.discardPhase(me);
  eq(me.hand.length, 2, '应弃到体力上限');
});

test('连营：失去最后一张手牌时摸一张', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['lianying'];
  deckTop('tao');
  const last = give(me, 'sha');
  noShan();
  await api.useCard(me, last, [foe], { asId: 'sha' });
  eq(me.hand.length, 1, '应因连营摸一张');
  eq(me.hand[0].id, 'tao');
});

test('枭姬：失去装备区的牌时摸两张', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['xiaoji'];
  const armor = equip(me, 'bagua');
  deckTop('sha', 'shan');
  give(foe, 'guohe');
  H.respond({
    yesno: () => ({ yes: true }),
    pickOne: () => ({ card: armor }),
  });
  await api.useCard(foe, foe.hand[0], [me], { asId: 'guohe' });
  eq(me.hand.length, 2, '枭姬应摸两张');
});

group('锁定技 · 濒死与救援');

test('完杀：贾诩回合内其他角色不能使用【桃】', async () => {
  const { G, P, api } = game(4);
  const killer = P[0], victim = P[2], other = P[1];
  killer.skills = ['wansha'];
  G.current = 0;
  give(other, 'tao');
  victim.hp = 1;
  H.respond({ save: () => null });
  await api.damage(killer, victim, 1, null, null);
  eq(victim.alive, false, '完杀生效，濒死角色应死亡');
});

test('没有完杀时，其他角色可以用【桃】救回', async () => {
  const { G, P, api } = game(4);
  const killer = P[0], victim = P[2], other = P[1];
  G.current = 0;
  const tao = give(other, 'tao');
  victim.hp = 1;
  H.respond({
    save: (p, req) => (p === other && req.target === victim ? { card: tao } : null),
    respond: (p, req) => (p === other && req.kind === 'respond' && req.forced ? { card: tao } : null),
  });
  await api.damage(killer, victim, 1, null, null);
  eq(victim.alive, true, '应该被救活');
  eq(victim.hp, 1, '回复到 1 点体力');
});

test('救援：其他吴势力角色对贾诩主公使用【桃】额外回复 1 点', async () => {
  const { G, P, api } = game(4);
  const lord = P[0], wu = P[1];
  lord.skills = ['jiuyuan'];
  lord.kingdom = 'qun';
  wu.kingdom = 'wu';
  G.current = 0;
  const tao = give(wu, 'tao');
  lord.hp = 1;
  H.respond({ save: (p) => (p === wu ? { card: tao } : null), respond: (p, req) => (p === wu && req.forced ? { card: tao } : null) });
  await api.damage(wu, lord, 1, null, null);
  eq(lord.hp, 2, '应回复 2 点（桃 1 + 救援 1）');
});

group('主公技');

test('护驾：主公需要【闪】时可令其他魏势力角色代打', async () => {
  const { G, P, api } = game(4);
  const lord = P[0], foe = P[1], wei = P[2];
  lord.skills = ['hujia'];
  lord.kingdom = 'wei';
  wei.kingdom = 'wei';
  const shan = give(wei, 'shan');
  G.current = 1;
  H.respond({
    yesno: () => ({ yes: true }),
    respond: (p) => (p === wei ? { card: shan } : null),
  });
  await api.useCard(foe, give(foe, 'sha'), [lord], { asId: 'sha' });
  eq(lord.hp, 4, '护驾成功，主公不该受伤');
  ok(!H.hasUid(wei, shan.uid), '魏势力的【闪】应被消耗');
});

test('激将：主公需要【杀】时可令其他蜀势力角色代打', async () => {
  const { G, P, api } = game(4);
  const lord = P[0], shu = P[1], foe = P[2];
  lord.skills = ['jijiang'];
  lord.kingdom = 'shu';
  shu.kingdom = 'shu';
  const sha = give(shu, 'sha');
  // 用【决斗】逼主公出杀
  G.current = 2;
  H.respond({
    yesno: () => ({ yes: true }),
    respond: (p) => (p === shu ? { card: sha } : null),
  });
  give(lord, 'tao');
  await api.useCard(foe, give(foe, 'juedou'), [lord], { asId: 'juedou' });
  eq(lord.hp, 4, '激将成功，主公不该受伤');
});

group('濒死 · 自救牌的选择');

test('自己的回合濒死，可以用【酒】自救', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 0;
  const jiu = give(me, 'jiu', 's');
  me.hp = 1;
  H.respond({ save: (p, req) => (p === me && req.valid && req.valid(jiu) ? { card: jiu } : null) });
  await api.damage(P[1], me, 1, null, null);
  eq(me.alive, true, '用【酒】应能救回自己');
  eq(me.hp, 1, '回复 1 点体力');
});

test('别人的回合濒死，仍可以用【酒】自救（酒不受回合归属限制）', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 1;                       // 伤害来自别人的回合
  const jiu = give(me, 'jiu', 'd');
  me.hp = 1;
  let offered = false;
  H.respond({
    save: (p, req) => {
      if (p !== me) return null;
      if (req.valid && req.valid(jiu)) { offered = true; return { card: jiu }; }
      return null;
    },
  });
  await api.damage(P[1], me, 1, null, null);
  ok(offered, '【酒】应作为可救牌出现');
  eq(me.alive, true, '回合外【酒】应能自救');
  eq(me.hp, 1, '回复 1 点体力');
});

test('【酒】自救不占用出牌阶段的「每回合限一次」', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 0;
  const j1 = give(me, 'jiu', 'd');
  const j2 = give(me, 'jiu', 's');
  me.hp = 1;
  H.respond({ save: (p, req) => (p === me && req.valid(j1) ? { card: j1 } : null) });
  await api.damage(P[1], me, 1, null, null);
  eq(me.alive, true);
  ok(!me.jiuUsed, '濒死用酒不应置出牌阶段标记');
  G.phase = 'play';
  eq(await api.useCard(me, j2, [], { asId: 'jiu' }), true, '随后出牌阶段仍可用酒');
});

test('濒死提示里只有真正能救命的牌可选（【闪】不行）', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 0;
  const tao = give(me, 'tao', 'h');
  const shan = give(me, 'shan', 'h');
  me.hp = 1;
  let seen = null;
  H.respond({
    save: (p, req) => { seen = req.valid; return null; },
    respond: () => null,
  });
  await api.damage(P[1], me, 1, null, null);
  ok(seen, '濒死请求应带 valid 过滤');
  ok(seen(tao), '【桃】应是可救牌');
  ok(!seen(shan), '【闪】不是可救牌');
  eq(me.alive, false, '放弃救援应死亡');
});

test('华佗：别人回合濒死可用红色牌自救（急救）', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  me.skills = ['jijiu'];
  G.current = 1;                       // 不是自己的回合
  const red = give(me, 'shan', 'h');
  me.hp = 1;
  H.respond({ save: (p, req) => (p === me && req.valid && req.valid(red) ? { card: red } : null) });
  await api.damage(P[1], me, 1, null, null);
  eq(me.alive, true, '回合外急救应生效');
});

test('选过一次牌后不会再问第二遍', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 0;
  const tao = give(me, 'tao', 'h');
  me.hp = 1;
  let forced = 0;
  H.respond({
    save: () => ({ card: tao }),
    respond: (p, req) => { if (req.forced) forced++; return null; },
  });
  await api.damage(P[1], me, 1, null, null);
  eq(me.alive, true);
  eq(forced, 0, '不应再弹一次选牌');
});
