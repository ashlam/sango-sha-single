'use strict';
/* ============================================================
 *  克己：出牌阶段内没用过 / 打出过【杀】时，可跳过弃牌阶段
 *  曾经的两个坑
 *   1. useCard 对所有牌都置 usedSha → 用一张锦囊就失去克己
 *   2. usedSha 从不重置 → 用过一次杀之后永久失效
 * ============================================================ */
const H = require('../skilllib');
const { group, test, eq, ok } = H;

/* 只对「是否发动克己」答 yes，其余一律不出牌 */
function answerKeji(rec) {
  H.respond({
    yesno: (p, req) => {
      if (/克己/.test(req.prompt || '')) { if (rec) rec.n++; return { yes: true }; }
      return { yes: false };
    },
    respond: () => null,
    play: () => ({ action: 'end' }),
  });
}

group('克己 · 弃牌阶段');

test('出牌阶段只用锦囊，仍可发动克己跳过弃牌', async () => {
  const { P, api, G } = H.game(4);
  const me = P[0];
  me.skills = ['keji'];
  me.hp = me.maxHp = 4;
  G.current = 0;
  G.phase = 'play';
  const rec = { n: 0 };
  answerKeji(rec);
  H.giveMany(me, 5, 'shan');
  const wz = H.give(me, 'wuzhong');
  H.deckTop('shan', 'shan');
  await api.useCard(me, wz, [me]);
  eq(me.flags.usedSha, undefined, '使用锦囊不应被记为「用过杀」');

  G.phase = 'discard';
  const before = me.hand.length;
  ok(before > api.handLimit(me), '构造条件：手牌应超过上限');
  await api.discardPhase(me);
  eq(me.hand.length, before, '克己生效，一张都不该弃');
  ok(rec.n >= 1, '应询问玩家是否发动克己');
});

test('出牌阶段用过【杀】，不能发动克己', async () => {
  const { P, api, G } = H.game(4);
  const me = P[0], foe = P[1];
  me.skills = ['keji'];
  me.hp = me.maxHp = 4;
  G.current = 0;
  G.phase = 'play';
  const rec = { n: 0 };
  H.respond({
    yesno: (p, req) => {
      if (/克己/.test(req.prompt || '')) { rec.n++; return { yes: true }; }
      return { yes: false };
    },
    respond: () => null,
    discard: (p, req) => ({ cards: p.hand.slice(0, req.min || 1) }),
  });
  H.giveMany(me, 5, 'shan');
  const sha = H.give(me, 'sha', 's');
  await api.useCard(me, sha, [foe]);
  eq(me.flags.usedSha, true, '使用【杀】应标记');

  G.phase = 'discard';
  await api.discardPhase(me);
  eq(rec.n, 0, '用过杀时不该询问克己');
  eq(me.hand.length, api.handLimit(me), '应弃到上限');
});

test('上回合用过【杀】，本回合没用则重置、可发动', async () => {
  const { P, api, G } = H.game(4);
  const me = P[0];
  me.skills = ['keji'];
  me.hp = me.maxHp = 4;
  me.flags.usedSha = true;               // 模拟上回合用过杀
  const rec = { n: 0 };
  answerKeji(rec);
  H.giveMany(me, 4, 'shan');             // 摸 2 张后 6 张 > 上限 4，才会走到弃牌判定
  H.deckTop('shan', 'shan', 'shan');
  await api.runTurn(me);
  eq(me.flags.usedSha, false, '回合开始应重置「用过杀」标记');
  ok(rec.n >= 1, '本回合没用杀，应询问克己');
});

test('没有克己技能时正常弃牌', async () => {
  const { P, api, G } = H.game(4);
  const me = P[0];
  me.skills = [];
  me.hp = me.maxHp = 4;
  G.current = 0;
  G.phase = 'discard';
  H.giveMany(me, 6, 'shan');
  H.respond({ discard: (p, req) => ({ cards: p.hand.slice(0, req.min || 1) }) });
  await api.discardPhase(me);
  eq(me.hand.length, api.handLimit(me), '应弃到上限');
});

test('打出【杀】（出牌阶段内）也算用过', async () => {
  const { P, api, G } = H.game(4);
  const me = P[0];
  me.skills = ['keji'];
  G.current = 0;
  G.phase = 'play';
  H.respond({ respond: () => null });
  // 在出牌阶段内被要求打出【杀】（例如决斗），应计入
  const sha = H.give(me, 'sha', 's');
  H.respond({ respond: (p, req) => (req.valid && req.valid(sha) ? { card: sha } : null) });
  await api.resolveJuedou(P[1], api.makeVirtual('juedou'), me);
  eq(me.flags.usedSha, true, '出牌阶段内打出【杀】应计入克己判断');
});

test('手牌未超上限时不打扰玩家（不弹克己）', async () => {
  const { P, api, G } = H.game(4);
  const me = P[0];
  me.skills = ['keji'];
  me.hp = me.maxHp = 4;
  G.current = 0;
  G.phase = 'discard';
  const rec = { n: 0 };
  answerKeji(rec);
  H.giveMany(me, 3, 'shan');       // 3 <= 上限 4
  await api.discardPhase(me);
  eq(rec.n, 0, '本来就不用弃牌，不该问');
  eq(me.hand.length, 3, '手牌不变');
});
