'use strict';
/* 三、主动技（出牌阶段发动） */
const H = require('../skilllib');
const { test, group, game, give, giveMany, equip, deckTop, ok, eq, eqArr, ne } = H;

/* 直接走引擎的主动技入口：带「每阶段限一次」校验 */
async function act(p, id) {
  return H.load().useActiveSkill(p, id);
}

group('主动技');

test('制衡：弃 N 张摸 N 张', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['zhiheng'];
  const h = giveMany(me, 3, 'shan');
  deckTop('sha', 'tao', 'jiu');
  H.respond({ discard: (p, req) => ({ cards: (req.pool || p.hand).slice(0, 2) }) });
  eq(await act(me, 'zhiheng'), true);
  eq(me.hand.length, 3, '弃 2 摸 2，总数不变');
  eqArr(H.handIds(me).sort(), ['sha', 'shan', 'tao'], '应是剩下的 1 张 + 摸到的 2 张');
});

test('制衡：每阶段限一次', async () => {
  const { P } = game(4);
  const me = P[0];
  me.skills = ['zhiheng'];
  giveMany(me, 2, 'shan');
  deckTop('sha', 'sha');
  eq(await act(me, 'zhiheng'), true, '第一次应成功');
  eq(await act(me, 'zhiheng'), false, '第二次应被拒绝');
});

test('苦肉：失去 1 点体力，摸两张牌', async () => {
  const { P } = game(4);
  const me = P[0];
  me.skills = ['kurou'];
  deckTop('sha', 'tao');
  eq(await act(me, 'kurou'), true);
  eq(me.hp, 3, '失去 1 点体力');
  eq(me.hand.length, 2, '摸两张');
});

test('苦肉：体力为 1 时仍可使用（可以把自己玩到濒死）', async () => {
  const { P } = game(4);
  const me = P[0];
  me.skills = ['kurou'];
  me.hp = 1;
  deckTop('sha', 'tao');
  H.respond({ save: () => null });
  await act(me, 'kurou');
  eq(me.hp, 0, '应进入濒死');
  eq(me.alive, false, '没人救则死亡');
});

test('仁德：给出两张牌后回复 1 点体力', async () => {
  const { P } = game(4);
  const me = P[0], ally = P[1];
  me.skills = ['rende'];
  me.hp = 2;
  giveMany(me, 2, 'shan');
  H.respond({
    discard: (p) => ({ cards: p.hand.slice() }),
    target: (p, req) => ({ targets: [ally] }),
  });
  eq(await act(me, 'rende'), true);
  eq(me.hand.length, 0, '牌应全部给出');
  eq(ally.hand.length, 2, '队友应收到两张');
  eq(me.hp, 3, '给出第二张牌回复 1 点体力');
});

test('仁德：只给一张牌不回复体力', async () => {
  const { P } = game(4);
  const me = P[0], ally = P[1];
  me.skills = ['rende'];
  me.hp = 2;
  give(me, 'shan');
  H.respond({ discard: (p) => ({ cards: p.hand.slice(0, 1) }), target: () => ({ targets: [ally] }) });
  await act(me, 'rende');
  eq(me.hp, 2, '一张不触发回复');
});

test('结姻：弃两张手牌，自己与已受伤男性各回 1 点', async () => {
  const { P } = game(4);
  const she = P[0], he = P[1];
  she.skills = ['jieyin'];
  she.sex = 'f';
  she.hp = 2;
  he.sex = 'm';
  he.hp = 2;
  giveMany(she, 2, 'shan');
  H.respond({ target: () => ({ targets: [he] }), discard: (p) => ({ cards: p.hand.slice(0, 2) }) });
  eq(await act(she, 'jieyin'), true);
  eq(she.hp, 3, '自己回复');
  eq(he.hp, 3, '对方回复');
  eq(she.hand.length, 0, '弃两张');
});

test('结姻：没有受伤男性时不能发动', async () => {
  const { P } = game(4);
  const she = P[0];
  she.skills = ['jieyin'];
  she.sex = 'f';
  giveMany(she, 2, 'shan');
  eq(await act(she, 'jieyin'), false);
});

test('青囊：弃一张手牌令受伤角色回复 1 点', async () => {
  const { P } = game(4);
  const me = P[0], ally = P[1];
  me.skills = ['qingnang'];
  ally.hp = 2;
  give(me, 'shan');
  H.respond({ target: () => ({ targets: [ally] }), discard: (p) => ({ cards: p.hand.slice(0, 1) }) });
  eq(await act(me, 'qingnang'), true);
  eq(ally.hp, 3);
  eq(me.hand.length, 0);
});

test('离间：弃一张牌令两名男性角色决斗', async () => {
  const { P } = game(5);
  const me = P[0], a = P[1], b = P[2];
  me.skills = ['lijian'];
  give(me, 'shan');
  a.sex = 'm'; b.sex = 'm';
  H.respond({
    target: () => ({ targets: [a, b] }),
    discard: () => ({ cards: [me.hand[0]] }),
    respond: () => null,       // 两人都不出杀
  });
  eq(await act(me, 'lijian'), true);
  eq(a.hp + b.hp, 7, '决斗中必有一方受到 1 点伤害');
  eq(me.hand.length, 0, '弃掉一张牌');
});

test('反间：目标花色不同则受到 1 点伤害', async () => {
  const { P } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['fanjian'];
  give(me, 'shan', 'h');          // 红桃
  H.respond({
    target: () => ({ targets: [foe] }),
    suit: () => ({ suit: 's' }),  // 目标选黑桃，不同
  });
  eq(await act(me, 'fanjian'), true);
  eq(foe.hp, 3, '花色不同应受伤');
  eq(foe.hand.length, 1, '目标应获得那张牌');
});

test('反间：花色相同则不受伤', async () => {
  const { P } = game(4);
  const me = P[0], foe = P[1];
  me.skills = ['fanjian'];
  give(me, 'shan', 's');
  H.respond({ target: () => ({ targets: [foe] }), suit: () => ({ suit: 's' }) });
  await act(me, 'fanjian');
  eq(foe.hp, 4, '花色相同不受伤');
});

test('缔盟：交换两名角色的手牌', async () => {
  const { P } = game(4);
  const me = P[0], a = P[1], b = P[2];
  me.skills = ['dimeng'];
  give(a, 'sha'); give(a, 'tao');
  give(b, 'shan');
  giveMany(me, 2, 'jiu');
  H.respond({
    target: () => ({ targets: [a, b] }),
    discard: (p, req) => ({ cards: p.hand.slice(0, req.min) }),
  });
  eq(await act(me, 'dimeng'), true);
  eqArr(H.handIds(a), ['shan'], 'a 应得到 b 的牌');
  eqArr(H.handIds(b).sort(), ['sha', 'tao'], 'b 应得到 a 的两张牌');
});

test('乱武：其他角色不出【杀】则失去 1 点体力', async () => {
  const { P } = game(4);
  const me = P[0];
  me.skills = ['luanwu'];
  H.respond({ respond: () => null });
  eq(await act(me, 'luanwu'), true);
  eq(P[1].hp + P[2].hp + P[3].hp, 9, '三名角色各失去 1 点');
});

test('乱武：有【杀】的角色出杀，打中距离最近的角色', async () => {
  const { P } = game(4);
  const me = P[0];
  me.skills = ['luanwu'];
  const sha = give(P[1], 'sha');
  H.respond({ respond: (p) => (p === P[1] ? { card: sha } : null) });
  await act(me, 'luanwu');
  eq(P[1].hand.length, 0, '【杀】应被打出');
  eq(P[0].hp, 4, '发动者不该被自己发动的乱武伤到');
  eq(P[2].hp, 2, '2 号位被【杀】命中，自己又没杀，共失去 2 点');
  eq(P[3].hp, 3, '3 号位没杀，失去 1 点体力');
});

test('乱武：限定技，整局只能用一次', async () => {
  const { P } = game(4);
  const me = P[0];
  me.skills = ['luanwu'];
  H.respond({ respond: () => null });
  eq(await act(me, 'luanwu'), true);
  eq(await act(me, 'luanwu'), false, '第二次应被拒绝');
});

test('观星：准备阶段把牌堆顶的牌重新排列', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  me.skills = ['guanxing'];
  deckTop('sha', 'tao', 'jiu', 'shan', 'guohe');   // 顶部 5 张
  H.respond({
    yesno: () => ({ yes: true }),
    arrange: (p, req) => ({ top: [req.cards[1], req.cards[0]], bottom: req.cards.slice(2) }),
  });
  await api.SKILLS.guanxing.preparePhase(me);
  eq(G.deck[G.deck.length - 1].id, 'tao', '牌堆顶应是第二张（被重排到第一）');
  eq(G.deck[G.deck.length - 2].id, 'sha', '第二张应是原来第一张');
});

test('洛神：判定黑色则获得并继续，直到红色', async () => {
  const { P, api, G } = game(4);
  const me = P[0];
  me.skills = ['luoshen'];
  // 判定依次：黑、黑、红
  deckTop(['sha', 's'], ['shan', 'c'], ['tao', 'h']);
  H.respond({
    yesno: () => ({ yes: true }),
    'pickOne': () => ({ card: null }),   // 不让鬼才之类介入
  });
  await api.SKILLS.luoshen.preparePhase(me);
  eq(me.hand.length, 2, '应获得两张黑牌');
  ok(H.hasCard(me, 'sha') && H.hasCard(me, 'shan'), '拿到的应是判定的黑牌');
});

test('闭月：结束阶段摸一张牌', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['biyue'];
  deckTop('tao');
  await api.SKILLS.biyue.turnEnd(me);
  eq(me.hand.length, 1);
  eq(me.hand[0].id, 'tao');
});

test('再起：受伤时亮出 X 张牌，红桃回血并收下，其余弃置', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['zaiqi'];
  me.hp = 2;                     // 已损失 2 点 → 亮 2 张
  deckTop(['tao', 'h'], ['sha', 's']);
  H.respond({ yesno: () => ({ yes: true }) });
  const n = await api.SKILLS.zaiqi.modifyDraw(me, { n: 2 });
  eq(n, 0, '改为不摸牌');
  eq(me.hp, 3, '一张红桃回复 1 点');
  eq(me.hand.length, 1, '只获得红桃牌');
});

test('好施：多摸两张', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['haoshi'];
  H.respond({ yesno: () => ({ yes: true }) });
  const n = await api.SKILLS.haoshi.modifyDraw(me, { n: 2 });
  eq(n, 4, '2 + 2 = 4');
  eq(me.marks.haoshi, true);
});

test('英姿：摸牌阶段多摸一张', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['yingzi'];
  H.respond({ yesno: () => ({ yes: true }) });
  eq(await api.SKILLS.yingzi.modifyDraw(me, { n: 2 }), 3);
});

test('裸衣：少摸一张，标记本回合伤害+1', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['luoyi'];
  H.respond({ yesno: () => ({ yes: true }) });
  eq(await api.SKILLS.luoyi.modifyDraw(me, { n: 2 }), 1, '少摸一张');
  eq(me.marks.luoyi, true);
});

test('突袭：改为获得两名角色各一张手牌', async () => {
  const { P, api } = game(4);
  const me = P[0];
  me.skills = ['tuxi'];
  give(P[1], 'sha'); give(P[2], 'tao');
  H.respond({ yesno: () => ({ yes: true }) });
  const n = await api.SKILLS.tuxi.modifyDraw(me, { n: 2 });
  eq(n, 0, '不摸牌');
  eq(me.hand.length, 2, '获得两张');
  eq(P[1].hand.length + P[2].hand.length, 0, '两名角色的手牌被拿走');
});

test('英魂：令一名角色摸 X 张再弃一张', async () => {
  const { P, api } = game(4);
  const me = P[0], t = P[1];
  me.skills = ['yinghun'];
  me.hp = 2;                     // X = 2
  deckTop('sha', 'tao', 'jiu');
  H.respond({
    yesno: () => ({ yes: true }),
    target: () => ({ targets: [t] }),
    choice: () => ({ option: 'draw' }),
    discard: (p) => ({ cards: p.hand.slice(0, 1) }),
  });
  await api.SKILLS.yinghun.preparePhase(me);
  eq(t.hand.length, 1, '摸 2 弃 1 → 净增 1 张');
});
