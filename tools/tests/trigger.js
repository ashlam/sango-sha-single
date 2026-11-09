'use strict';
/* 四、触发技：受伤后、判定时、阶段切换、他人死亡等时机 */
const H = require('../skilllib');
const { test, group, game, give, giveMany, equip, deckTop, ok, eq, eqArr, ne } = H;

group('触发技 · 受伤后');

test('奸雄：受到伤害后获得造成伤害的牌', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['jianxiong'];
  const sha = give(foe, 'sha');
  H.respond({ yesno: () => ({ yes: true }), respond: () => null });
  await api.useCard(foe, sha, [me], { asId: 'sha' });
  eq(me.hp, 3, '先受到伤害');
  ok(H.hasUid(me, sha.uid), '【杀】应进入奸雄手中');
  ok(!api.G.discard.some(c => c.uid === sha.uid), '不该进弃牌堆');
});

test('奸雄：不发动则牌进弃牌堆', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['jianxiong'];
  const sha = give(foe, 'sha');
  H.respond({ yesno: () => ({ yes: false }), respond: () => null });
  await api.useCard(foe, sha, [me], { asId: 'sha' });
  ok(!H.hasUid(me, sha.uid), '不该获得');
  ok(api.G.discard.some(c => c.uid === sha.uid), '应进弃牌堆');
});

test('反馈：受到伤害后获得伤害来源一张牌', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['fankui'];
  give(foe, 'tao');
  const sha = give(foe, 'sha');
  H.respond({
    yesno: () => ({ yes: true }),
    respond: () => null,
    pickOne: (p, req) => ({ card: req.cards[0] }),
  });
  await api.useCard(foe, sha, [me], { asId: 'sha' });
  eq(me.hand.length, 1, '应获得一张牌');
  eq(foe.hand.length, 0, '来源被拿掉一张');
});

test('刚烈：判定非红桃，来源选择弃两张手牌', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['ganglie'];
  const sha = give(foe, 'sha');
  giveMany(foe, 2, 'tao');
  deckTop(['shan', 's']);                    // 判定：黑桃，非红桃
  H.respond({
    yesno: () => ({ yes: true }),
    choice: () => ({ option: 'discard' }),
    discard: (p) => ({ cards: p.hand.slice(0, 2) }),
    respond: () => null,
  });
  await api.useCard(foe, sha, [me], { asId: 'sha' });
  eq(foe.hp, 4, '来源选择弃牌则不受伤');
  eq(foe.hand.length, 0, '应弃掉两张手牌');
});

test('刚烈：判定为红桃则无效', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['ganglie'];
  giveMany(foe, 2, 'tao');
  deckTop(['tao', 'h']);
  H.respond({ yesno: () => ({ yes: true }), respond: () => null });
  await api.useCard(foe, give(foe, 'sha'), [me], { asId: 'sha' });
  eq(foe.hp, 4, '红桃判定，刚烈无效');
  eq(foe.hand.length, 2, '手牌不变');
});

test('遗计：受伤后摸两张牌并可以交给别人', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1], ally = P[2];
  me.skills = ['yiji'];
  deckTop('tao', 'jiu');
  H.respond({
    yesno: () => ({ yes: true }),
    target: () => ({ targets: [ally] }),
    respond: () => null,
  });
  await api.useCard(foe, give(foe, 'sha'), [me], { asId: 'sha' });
  eq(ally.hand.length, 2, '两张牌应交给队友');
  eq(me.hand.length, 0, '自己不留下');
});

test('放逐：受伤后令一名角色摸 X 张并翻面', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1], t = P[2];
  me.skills = ['fangzhu'];
  me.hp = 2;                              // 已损失 2 点 → X = 2（受伤后为 3）
  deckTop('tao', 'jiu', 'shan');
  H.respond({ yesno: () => ({ yes: true }), target: () => ({ targets: [t] }), respond: () => null });
  await api.useCard(foe, give(foe, 'sha'), [me], { asId: 'sha' });
  eq(me.hp, 1);
  eq(t.hand.length, 3, 'X = 3 张');
  eq(t.flipped, true, '应翻面');
});

test('烈刃：用【杀】造成伤害后拼点获胜，获得对方一张牌', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['lieren'];
  give(me, 'tao', 's', 12);              // 拼点牌，K
  give(foe, 'shan', 's', 2);             // 拼点牌，小
  give(foe, 'tao', 'h', 5);              // 之后被拿走的牌
  H.respond({
    yesno: () => ({ yes: true }),
    pickOne: (p) => ({ card: p.hand[0] }),
    respond: () => null,
  });
  await api.useCard(me, give(me, 'sha'), [foe], { asId: 'sha' });
  eq(foe.hp, 3, '先造成伤害');
  eq(me.hand.length, 1, '拼点牌被打出，赢来的牌进手');
  eq(foe.hand.length, 0, '对方被拿掉一张');
});

group('触发技 · 判定');

test('天妒：判定牌生效后获得之', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['tiandu'];
  deckTop(['tao', 'h', 5]);
  H.respond({ yesno: () => ({ yes: true }) });
  await api.judge(me, 'test');
  eq(me.hand.length, 1, '判定牌应进入手牌');
  eq(me.hand[0].id, 'tao');
});

test('鬼才：打出一张手牌代替判定牌', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['guicai'];
  const sub = give(me, 'tao', 'h', 13);
  deckTop(['sha', 's', 1]);
  H.respond({
    yesno: () => ({ yes: true }),
    pickOne: (p, req) => ({ card: sub }),
  });
  const j = await api.judge(me, 'test');
  eq(j.id, 'tao', '判定结果应被替换');
  eq(j.num, 13);
  ok(!H.hasUid(me, sub.uid), '打出的手牌应离开手牌');
});

test('颂威：其他魏势力角色判定为黑色，主公摸一张', async () => {
  const { G, P, api } = game(4);
  const lord = P[0], wei = P[1];
  lord.skills = ['songwei'];
  lord.kingdom = 'wei';
  wei.kingdom = 'wei';
  G.current = 0;
  deckTop(['sha', 's', 5], ['tao', 'h', 3]);
  H.respond({ yesno: () => ({ yes: true }) });
  await api.judge(wei, 'test');
  eq(lord.hand.length, 1, '黑色判定应触发颂威');
});

test('颂威：判定为红色不触发', async () => {
  const { G, P, api } = game(4);
  const lord = P[0], wei = P[1];
  lord.skills = ['songwei'];
  wei.kingdom = 'wei';
  G.current = 0;
  deckTop(['tao', 'h', 5]);
  H.respond({ yesno: () => ({ yes: true }) });
  await api.judge(wei, 'test');
  eq(lord.hand.length, 0, '红桃不触发');
});

test('颂威：非魏势力角色判定不触发', async () => {
  const { G, P, api } = game(4);
  const lord = P[0], shu = P[1];
  lord.skills = ['songwei'];
  shu.kingdom = 'shu';
  G.current = 0;
  deckTop(['sha', 's', 5]);
  H.respond({ yesno: () => ({ yes: true }) });
  await api.judge(shu, 'test');
  eq(lord.hand.length, 0, '非魏势力不触发');
});

group('触发技 · 其他时机');

test('集智：使用非延时锦囊时摸一张', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['jizhi'];
  const wz = give(me, 'wuzhong');
  deckTop('sha', 'tao', 'jiu');       // 第一张给无中生有，后面两张是额外摸的
  H.respond({ yesno: () => ({ yes: true }) });
  await api.useCard(me, wz, [], { asId: 'wuzhong' });
  // 无中生有摸 2 + 集智摸 1 = 3
  eq(me.hand.length, 3, '应摸 3 张（2 + 集智 1）');
});

test('集智：使用【杀】不触发', async () => {
  const { P, api } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['jizhi'];
  deckTop('tao');
  H.respond({ respond: () => null });
  await api.useCard(me, give(me, 'sha'), [foe], { asId: 'sha' });
  eq(me.hand.length, 0, '不该摸牌');
});

test('行殇：其他角色死亡时获得其所有牌', async () => {
  const { G, P, api } = game(4);
  const me = P[0], dying = P[2];
  me.skills = ['xingshang'];
  give(dying, 'tao');
  equip(dying, 'bagua');
  dying.hp = 1;
  H.respond({ yesno: () => ({ yes: true }), save: () => null });
  await api.damage(P[1], dying, 1, null, null);
  eq(dying.alive, false);
  eq(me.hand.length, 2, '应获得手牌 + 装备');
});

test('崩坏：结束阶段体力不是最少时减体力上限', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['benghuai'];
  me.hp = 4; me.maxHp = 4;
  P[1].hp = 2;
  await api.SKILLS.benghuai.turnEnd(me);
  ok(me.maxHp === 3 || me.hp === 3, '应减 1 点体力或体力上限');
});

test('崩坏：自己体力最少时不触发', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['benghuai'];
  me.hp = 1;
  await api.SKILLS.benghuai.turnEnd(me);
  eq(me.maxHp, 4, '不该减体力上限');
  eq(me.hp, 1);
});
