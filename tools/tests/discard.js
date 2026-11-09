'use strict';
/* 弃牌阶段：引擎必须把「弃几张 / 为什么 / 不能取消」说清楚交给界面 */
const H = require('../skilllib');
const { test, group, game, give, ok, eq } = H;

group('弃牌提示 · 引擎请求');

test('手牌超上限：请求带标题、张数、上限，且不可取消', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  me.hp = 3; me.maxHp = 3;
  ['sha', 'shan', 'tao', 'wuzhong', 'sha'].forEach(id => give(me, id));
  let req = null;
  G.beat = async () => {};
  H.respond({
    discard: (p, r) => { req = r; return { cards: me.hand.slice(0, r.min) }; },
  });
  await api.discardPhase(me);

  ok(!!req, '发出了弃牌请求');
  eq(req.kind, 'discard', '请求类型是弃牌');
  eq(req.title, '弃牌', '带「弃牌」标题');
  eq(req.min, 2, '5 张手牌 / 上限 3 → 需弃 2 张');
  eq(req.max, 2, '最多也只能弃 2 张');
  eq(req.limit, 3, '带手牌上限');
  eq(req.cancelable, false, '弃牌阶段不可取消');
  eq(me.hand.length, 3, '弃完后恰好等于上限');
});

test('没超上限：不打扰玩家', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  me.hp = 4; me.maxHp = 4;
  give(me, 'sha'); give(me, 'shan');
  let req = null;
  G.beat = async () => {};
  H.respond({ discard: (p, r) => { req = r; return null; } });
  await api.discardPhase(me);
  eq(req, null, '不需要弃牌就不发请求');
  eq(me.hand.length, 2, '手牌不变');
});

test('弃掉的每一张牌都写进战报（带花色牌名，可点看详情）', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  const a = give(me, 'sha', 's', 7);
  const b = give(me, 'tao', 'h', 3);
  G.log.length = 0;
  api.discardCards(me, [a, b]);
  const txt = G.log.map(x => x.text).join(' | ');
  ok(txt.includes('♠7·杀') && txt.includes('♥3·桃'), `战报列出具体牌名（${txt}）`);
  eq(me.hand.length, 0, '牌确实离手');
  eq(G.discard.length, 2, '进入弃牌堆');
});

test('过河拆桥已有更完整的上下文日志，不重复记一条', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  const c = give(me, 'shan', 'd', 2);
  G.log.length = 0;
  api.discardCards(me, [c], { silent: true });
  eq(G.log.length, 0, 'silent 时不写通用弃牌日志');
});

test('限定范围的弃牌：AI 只在允许的牌里挑', async () => {
  const { P, api } = game(4);
  const me = P[0];
  const red = give(me, 'sha', 'h');
  give(me, 'tao', 's');
  const r = await api.AI.decide(me, {
    kind: 'discard', min: 1, max: 1, cards: [red], prompt: '弃置一张红桃牌',
  });
  ok(r && r.cards && r.cards.length === 1, '返回了一张牌');
  eq(r.cards[0].uid, red.uid, '只从 req.cards 限定范围内挑（火攻同花色）');
});
