'use strict';
/* 武器：方天画戟（最后一张手牌【杀】可额外选两个目标） */
const H = require('../skilllib');
const { test, group, game, give, equip, ok, eq } = H;

group('武器 · 方天画戟');

const noShan = () => H.respond({ respond: () => null });

test('方天画戟：最后一张手牌【杀】上限为 3', async () => {
  const { P, api } = game(4);
  const me = P[0];
  equip(me, 'fangtian');
  const sha = give(me, 'sha', 's');
  eq(api.targetCountRange(me, 'sha', sha).max, 3, '重铸前：应能额外选两个目标');

  // 手里还有别的牌时不算「最后的手牌」
  give(me, 'shan', 'h');
  eq(api.targetCountRange(me, 'sha', sha).max, 1, '手中还有别的牌时只能选 1 个');
});

test('方天画戟：没有这把武器时上限仍是 1', async () => {
  const { P, api } = game(4);
  const me = P[0];
  const sha = give(me, 'sha', 's');
  eq(api.targetCountRange(me, 'sha', sha).max, 1);
});

test('方天画戟：一张【杀】同时结算 3 个目标', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  equip(me, 'fangtian');
  G.current = 0;
  G.phase = 'play';
  const sha = give(me, 'sha', 's');
  noShan();
  eq(await api.useCard(me, sha, [P[1], P[2], P[3]], { asId: 'sha' }), true, '应允许 3 个目标');
  eq([P[1].hp, P[2].hp, P[3].hp].join(','), '3,3,3', '三名目标各受 1 点伤害');
  eq(me.hand.length, 0, '手牌用光');
});

test('方天画戟：仍可以选择只打 1 个目标', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  equip(me, 'fangtian');
  G.current = 0;
  G.phase = 'play';
  const sha = give(me, 'sha', 's');
  noShan();
  eq(await api.useCard(me, sha, [P[1]], { asId: 'sha' }), true);
  eq(P[1].hp, 3);
  eq(P[2].hp, 4, '未选的目标不受伤');
});

test('普通【杀】多传目标会被裁掉，只结算第一个', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 0;
  G.phase = 'play';
  const sha = give(me, 'sha', 's');
  give(me, 'shan', 'h');           // 手牌不止一张
  noShan();
  eq(await api.useCard(me, sha, [P[1], P[3]], { asId: 'sha' }), true);
  eq(P[1].hp, 3, '第一个目标受伤');
  eq(P[3].hp, 4, '第二个目标不应受伤');
});

test('方天画戟 + 流离：其余目标照常结算，被抓的人不重复挨打', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  equip(me, 'fangtian');
  G.current = 0;
  G.phase = 'play';
  const sha = give(me, 'sha', 's');
  P[1].skills = ['liuli'];
  give(P[1], 'shan', 'h');           // 流离的弃牌
  H.respond({ respond: () => null });
  await api.useCard(me, sha, [P[1], P[2], P[3]], { asId: 'sha' });
  eq(P[1].hp, 4, '流离后原目标不受伤');
  eq(P[2].hp, 3, '转移目标受伤一次');
  eq(P[3].hp, 3, '第三个目标照常受伤');
});

test('方天画戟：额外目标各自响应【闪】', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  equip(me, 'fangtian');
  G.current = 0;
  G.phase = 'play';
  const sha = give(me, 'sha', 's');
  const shan1 = give(P[1], 'shan', 'h');
  const shan3 = give(P[3], 'shan', 'h');
  H.respond({
    respond: (p, req) => (req.kind === 'respond' && req.asId === 'shan'
      ? (p === P[1] ? { card: shan1 } : p === P[3] ? { card: shan3 } : null)
      : null),
  });
  await api.useCard(me, sha, [P[1], P[2], P[3]], { asId: 'sha' });
  eq(P[1].hp, 4, '甲闪掉了');
  eq(P[2].hp, 3, '乙没有闪，受伤');
  eq(P[3].hp, 4, '丁闪掉了');
});
