'use strict';
/* 群体锦囊：结算顺序一律「从使用者开始，按座位顺序」 */
const H = require('../skilllib');
const { test, group, game, give, deckTop, ok, eq, eqArr } = H;

group('群体锦囊 · 结算顺序');

/* 五谷丰登：从使用者起依次选牌（旧实现从 0 号位起，会用错顺序） */
test('五谷丰登：从使用者开始按座位顺序依次选牌', async () => {
  const { G, P, api } = game(4);
  const user = P[2];
  G.current = 2;
  deckTop('sha', 'shan', 'tao', 'jiu');
  const wg = give(user, 'wugu', 'h');
  const order = [];
  H.respond({
    pickOne: (p, req) => {
      order.push(p.name);
      return { card: (req.cards || [])[0] };
    },
  });
  eq(await api.useCard(user, wg, [], { asId: 'wugu' }), true, '五谷应能使用');
  eqArr(order, ['丙', '丁', '甲', '乙'], '应从使用者（丙）开始，绕一圈');
  eq(P[2].hand.length, 1, '使用者自己先拿一张');
  eq(P[0].hand.length, 1, '其他存活角色各拿一张');
});

test('五谷丰登：使用者是 0 号位时顺序为 0-1-2-3', async () => {
  const { G, P, api } = game(4);
  const user = P[0];
  G.current = 0;
  deckTop('sha', 'shan', 'tao', 'jiu');
  const wg = give(user, 'wugu', 'h');
  const order = [];
  H.respond({ pickOne: (p) => { order.push(p.name); return { card: null }; } });
  await api.useCard(user, wg, [], { asId: 'wugu' });
  eqArr(order, ['甲', '乙', '丙', '丁'], '0 号位使用时应按座位正序');
  eq(P[0].hand.length, 1, '兜底也应给使用者一张');
});

test('五谷丰登：AI 优先拿对自己最有用的牌', async () => {
  const { G, P, api } = game(4);
  const user = P[2];
  G.current = 2;
  deckTop('jiu', 'shan', 'tao', 'sha');
  const wg = give(user, 'wugu', 'h');
  P.forEach(p => { p.isAI = true; });
  user.isAI = false;                     // 使用者仍走 ask，拿第一张
  H.respond({ pickOne: (p, req) => ({ card: (req.cards || [])[0] }) });
  await api.useCard(user, wg, [], { asId: 'wugu' });
  eq(user.hand[0].id, 'jiu', '使用者拿第一张');
  ok(P[3].hand.some(c => c.id === 'tao'), 'AI 应在剩余牌里挑【桃】而不是随手拿第一张');
});

/* 南蛮入侵：从使用者开始逐个结算，且不含使用者本人 */
test('南蛮入侵：从使用者开始结算，不含使用者', async () => {
  const { G, P, api } = game(4);
  const user = P[1];
  G.current = 1;
  const hits = [];
  G.beat = async (ev, data) => { if (ev === 'dmg') hits.push(data.target.name); };
  H.respond({ respond: () => null });
  const nm = give(user, 'nanman', 's');
  await api.useCard(user, nm, [], { asId: 'nanman' });
  eqArr(hits, ['丙', '丁', '甲'], '应从使用者（乙）的下家开始，绕回甲');
  eq(user.hp, 4, '使用者不受南蛮影响');
});

test('万箭齐发：伤害顺序同样从使用者开始', async () => {
  const { G, P, api } = game(4);
  const user = P[3];
  G.current = 3;
  const hits = [];
  G.beat = async (ev, data) => { if (ev === 'dmg') hits.push(data.target.name); };
  H.respond({ respond: () => null });
  const wj = give(user, 'wanjian', 'h');
  await api.useCard(user, wj, [], { asId: 'wanjian' });
  eqArr(hits, ['甲', '乙', '丙'], '应从使用者（丁）的下家开始');
});

/* 桃园结义：从使用者开始依次回复（体力不满的人才结算） */
test('桃园结义：从使用者开始依次回复体力', async () => {
  const { G, P, api } = game(4);
  const user = P[2];
  G.current = 2;
  P.forEach(p => { p.hp = 2; });
  const ty = give(user, 'taoyuan', 'h');
  await api.useCard(user, ty, [], { asId: 'taoyuan' });
  const healed = G.log.filter(l => l.cls === 'heal' && /回复/.test(l.text)).map(l => l.text.split(' 回复')[0]);
  eqArr(healed, ['丙', '丁', '甲', '乙'], '按使用者起的顺序依次回复');
});
