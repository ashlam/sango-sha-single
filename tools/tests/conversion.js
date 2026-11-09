'use strict';
/* 一、视为技（viewAs）：把一张牌当另一张牌使用/打出 */
const H = require('../skilllib');
const { test, group, game, give, ok, eq, eqArr } = H;

function ids(list) { return list.map(x => x.id).join(','); }
function view(p, id, suit, num) {
  const c = H.mk(id, suit, num);
  return (H.load().viewsOf(p, c) || []).map(x => x.id);
}

group('视为技');

test('武圣：红色牌可当【杀】，黑色牌不行', () => {
  const { P } = game(4);
  const p = P[0];
  p.skills = ['wusheng'];
  eqArr(view(p, 'shan', 'h'), ['sha'], '红桃【闪】应可当杀');
  eqArr(view(p, 'tao', 'd'), ['sha'], '方块【桃】应可当杀');
  eqArr(view(p, 'shan', 's'), [], '黑桃【闪】不可当杀');
  eqArr(view(p, 'sha', 'h'), [], '已经是【杀】就不再转换');
});

test('倾国：黑色牌可当【闪】', () => {
  const { P } = game(4);
  const p = P[0];
  p.skills = ['qingguo'];
  eqArr(view(p, 'sha', 's'), ['shan']);
  eqArr(view(p, 'tao', 'h'), [], '红桃不可当闪');
});

test('龙胆：【杀】当【闪】、【闪】当【杀】，其他牌不行', () => {
  const { P } = game(4);
  const p = P[0];
  p.skills = ['longdan'];
  eqArr(view(p, 'sha', 's'), ['shan']);
  eqArr(view(p, 'shan', 'h'), ['sha']);
  eqArr(view(p, 'tao', 'h'), []);
});

test('奇袭：黑色牌可当【过河拆桥】', () => {
  const { P } = game(4);
  const p = P[0];
  p.skills = ['qixi'];
  eqArr(view(p, 'sha', 'c'), ['guohe']);
  eqArr(view(p, 'sha', 'd'), []);
});

test('国色：方块牌可当【乐不思蜀】', () => {
  const { P } = game(4);
  const p = P[0];
  p.skills = ['guose'];
  eqArr(view(p, 'sha', 'd'), ['lebu']);
  eqArr(view(p, 'sha', 'h'), []);
});

test('断粮：黑色基本牌/装备牌可当【兵粮寸断】，锦囊不行', () => {
  const { P } = game(4);
  const p = P[0];
  p.skills = ['duanliang'];
  eqArr(view(p, 'sha', 's'), ['bingliang'], '黑色基本牌');
  eqArr(view(p, 'bagua', 'c'), ['bingliang'], '黑色装备牌');
  eqArr(view(p, 'guohe', 's'), [], '黑色锦囊不可');
});

test('酒池：黑桃牌可当【酒】', () => {
  const { P } = game(4);
  const p = P[0];
  p.skills = ['jiuchi'];
  eqArr(view(p, 'sha', 's'), ['jiu']);
  eqArr(view(p, 'sha', 'c'), [], '梅花不可');
});

test('急救：回合外红色牌当【桃】，回合内不可', () => {
  const { P, G } = game(4);
  const p = P[1];
  p.skills = ['jijiu'];
  G.current = 0;
  eqArr(view(p, 'shan', 'h'), ['tao'], '回合外应可用');
  G.current = 1;
  eqArr(view(p, 'shan', 'h'), [], '自己回合内不可用');
});

test('多视为技叠加：同时拥有武圣+龙胆时返回多个选项', () => {
  const { P } = game(4);
  const p = P[0];
  p.skills = ['wusheng', 'longdan'];
  const v = view(p, 'shan', 'h').sort();
  eqArr(v, ['sha', 'sha'], '红【闪】可当杀（两种途径各返回一个）');
});

group('视为技 · 实际生效');

test('武圣：红色【桃】真的能当【杀】用出去并造成伤害', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['wusheng'];
  H.respond({ 'respond': () => null });   // 目标不出闪
  const c = give(me, 'tao', 'h');
  const okr = await api.useCard(me, c, [foe], { asId: 'sha' });
  ok(okr, 'useCard 应成功');
  eq(foe.hp, 3, '目标应受 1 点伤害');
  ok(!H.hasUid(me, c.uid), '转化牌应离开手牌');
});

test('龙胆：把【闪】当【杀】用出去', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['longdan'];
  H.respond({ 'respond': () => null });
  const c = give(me, 'shan', 'h');
  const okr = await api.useCard(me, c, [foe], { asId: 'sha' });
  ok(okr, 'useCard 应成功');
  eq(foe.hp, 3);
});

test('倾国：把黑色手牌当【闪】打出（抵消【杀】）', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  foe.skills = ['qingguo'];
  const black = H.give(foe, 'sha', 'c');
  H.respond({
    'respond': (p, req) => (p === foe ? { card: black } : null),
  });
  const sha = H.give(me, 'sha', 's');
  await api.useCard(me, sha, [foe], { asId: 'sha' });
  eq(foe.hp, 4, '倾国当闪成功后不应受伤');
  ok(!H.hasUid(foe, black.uid), '黑色牌应被消耗');
});

group('视为技 · 响应场景（南蛮 / 决斗 / 乱武）');

test('龙胆：拿【闪】当【杀】响应【南蛮入侵】', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  foe.skills = ['longdan'];
  const shan = give(foe, 'shan', 'h');
  H.respond({ 'respond': (p, req) => (p === foe && req.valid && req.valid(shan) ? { card: shan } : null) });
  await api.resolveCard(me, api.makeVirtual('nanman'), 'nanman', [foe]);
  eq(foe.hp, 4, '用【闪】当【杀】响应后不应受伤');
  ok(!H.hasUid(foe, shan.uid), '【闪】应被消耗');
});

test('没有龙胆时，【闪】不能当【杀】响应【南蛮入侵】', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  const shan = give(foe, 'shan', 'h');
  H.respond({ 'respond': (p, req) => (p === foe && req.valid && req.valid(shan) ? { card: shan } : null) });
  await api.resolveCard(me, api.makeVirtual('nanman'), 'nanman', [foe]);
  eq(foe.hp, 3, '普通武将不能拿【闪】当【杀】，应受伤');
  ok(H.hasUid(foe, shan.uid), '【闪】应留在手里');
});

test('龙胆：拿【闪】当【杀】响应【决斗】', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  foe.skills = ['longdan'];
  const shan = give(foe, 'shan', 'h');
  H.respond({ 'respond': (p, req) => (p === foe && req.valid && req.valid(shan) ? { card: shan } : null) });
  await api.resolveCard(me, api.makeVirtual('juedou'), 'juedou', [foe]);
  eq(foe.hp, 4, '决斗里用【闪】当【杀】，不该受伤');
  eq(me.hp, 3, '接下来轮到使用者出不了【杀】，应由他掉血');
});

test('武圣：红色【闪】也能当【杀】响应（与视为技一致）', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  foe.skills = ['wusheng'];
  const shan = give(foe, 'shan', 'h');
  H.respond({ 'respond': (p, req) => (p === foe && req.valid && req.valid(shan) ? { card: shan } : null) });
  await api.resolveCard(me, api.makeVirtual('nanman'), 'nanman', [foe]);
  eq(foe.hp, 4, '武圣红牌当杀应生效');
});

test('乱武：龙胆可以用【闪】当【杀】响应', async () => {
  const { P, api, G } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['luanwu'];
  foe.skills = ['longdan'];
  G.players.forEach(p => { p.hp = p.maxHp = 4; });
  give(me, 'shan');                      // 自己没杀，靠乱武逼人
  const shan = give(foe, 'shan', 'h');
  H.respond({ 'respond': (p, req) => (p === foe && req.valid && req.valid(shan) ? { card: shan } : null) });
  await api.useActiveSkill(me, 'luanwu');
  eq(foe.hand.length, 0, '【闪】应被打出');
});
