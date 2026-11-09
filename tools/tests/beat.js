'use strict';
/* 展示节拍：引擎必须把「伤害 → 濒死 → 救援 → 回复 → 阵亡」一个个抛给 UI，
 * 否则牌桌上就只能看到体力数字瞬间跳动（用户报过这个问题）。 */
const H = require('../skilllib');
const { test, group, game, give, ok, eq, eqArr } = H;

group('展示节拍 · 濒死链路');

test('杀 → 濒死 → 桃 → 回复：节拍顺序正确', async () => {
  const { G, P, api } = game(4);
  const me = P[0], victim = P[1], savior = P[2];
  me.identity = 'lord'; victim.identity = 'loyal'; savior.identity = 'loyal';
  G.current = 0;
  const evs = [];
  G.beat = async (ev, d) => {
    evs.push(ev + (d && d.target ? ':' + d.target.name : d && d.player ? ':' + d.player.name : ''));
  };
  victim.hp = 1;
  const tao = give(savior, 'tao', 'h');
  H.respond({ save: (p, req) => (p === savior && req.valid && req.valid(tao) ? { card: tao } : null) });
  await api.damage(me, victim, 1, null, null);

  eqArr(evs, ['dmg:' + victim.name, 'dying:' + victim.name, 'save:' + victim.name, 'heal:' + victim.name],
    '顺序应为 伤害 → 濒死 → 救援 → 回复');
  eq(victim.alive, true, '被救回来了');
  eq(victim.hp, 1, '回复 1 点体力');
});

test('没人救时：濒死之后紧接着阵亡节拍', async () => {
  const { G, P, api } = game(4);
  const me = P[0], victim = P[1];
  me.identity = 'lord'; victim.identity = 'loyal';
  G.current = 0;
  const evs = [];
  G.beat = async (ev, d) => evs.push(ev + (d && d.target ? ':' + d.target.name : d && d.player ? ':' + d.player.name : ''));
  victim.hp = 1;
  P.forEach(p => { p.hand = []; });        // 谁都没有桃
  H.respond({ save: () => null });
  await api.damage(me, victim, 1, null, null);

  eqArr(evs, ['dmg:' + victim.name, 'dying:' + victim.name, 'death:' + victim.name],
    '顺序应为 伤害 → 濒死 → 阵亡');
  eq(victim.alive, false, '无救援应阵亡');
});

test('救援节拍带着「谁救的、用的哪张牌」', async () => {
  const { G, P, api } = game(4);
  const me = P[0], victim = P[1], savior = P[3];
  me.identity = 'lord'; victim.identity = 'loyal'; savior.identity = 'loyal';
  G.current = 0;
  let saved = null;
  G.beat = async (ev, d) => { if (ev === 'save') saved = d; };
  victim.hp = 1;
  const tao = give(savior, 'tao', 'h');
  H.respond({ save: (p, req) => (p === savior && req.valid(tao) ? { card: tao } : null) });
  await api.damage(me, victim, 1, null, null);

  ok(!!saved, '应发出 save 节拍');
  eq(saved.savior && saved.savior.seat, savior.seat, '节拍里有救援者');
  eq(saved.target && saved.target.seat, victim.seat, '节拍里有被救者');
  eq(saved.card && saved.card.id, 'tao', '节拍里有用的牌');
  eq(saved.amount, 1, '节拍里带回复量');
});

test('濒死自救（酒）也走 save 节拍', async () => {
  const { G, P, api } = game(4);
  const victim = P[1];
  G.current = 2;
  const evs = [];
  G.beat = async (ev, d) => evs.push(ev + (d && d.target ? ':' + d.target.name : d && d.player ? ':' + d.player.name : ''));
  victim.hp = 1;
  const jiu = give(victim, 'jiu', 's');
  H.respond({ save: (p, req) => (p === victim && req.valid(jiu) ? { card: jiu } : null) });
  await api.damage(P[0], victim, 1, null, null);
  ok(evs.some(e => e.indexOf('save') === 0) && evs.indexOf('heal:' + victim.name) >= 0,
    '自救同样有 救援 → 回复 节拍');
  eq(victim.alive, true);
});
