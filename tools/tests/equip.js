'use strict';
/* ============================================================
 *  装备牌单元测试：10 武器 / 4 防具 / 7 坐骑，逐件验证效果
 *  - 每件装备至少一条「效果正确触发」的正向用例
 *  - 关键装备补一条反向用例（没装备 / 条件不满足时不该生效）
 * ============================================================ */
const H = require('../skilllib');
const { game, respond, refuse, give, equip, deckTop, ok, eq, eqArr, mk, test, group } = H;

/* 打一张【杀】到目标身上，目标默认不出闪 */
async function shaHit(api, user, target, suit, asId) {
  const c = give(user, asId || 'sha', suit || 's');
  await api.useCard(user, c, [target], { asId: asId || 'sha' });
  return c;
}

/* ---------------- 武器 ---------------- */

group('装备 · 武器');

test('诸葛连弩：本回合已出过【杀】仍可继续出', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0; G.phase = 'play';
  equip(me, 'zhuge');
  me.shaCount = 1;                       // 本回合已经出过一张
  const s = give(me, 'sha', 's');
  eq(await api.useCard(me, s, [t], { asId: 'sha' }), true, '连弩应允许继续使用【杀】');
  eq(t.hp, 3, '目标应受到 1 点伤害');
  eq(me.shaCount, 2, '出杀次数应累计');
});

test('诸葛连弩：没装备时第二张【杀】被拒绝', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0; G.phase = 'play';
  me.shaCount = 1;
  const s = give(me, 'sha', 's');
  eq(await api.useCard(me, s, [t], { asId: 'sha' }), false, '普通武器一回合只能出一张【杀】');
  eq(t.hp, 4, '目标不应受伤');
});

test('青釭剑：无视仁王盾，黑色【杀】照常造成伤害', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'qinggang');
  equip(t, 'renwang');
  await shaHit(api, me, t, 's');          // 黑桃 = 黑色
  eq(t.hp, 3, '青釭剑应无视仁王盾');
});

test('青釭剑：无视藤甲，普通【杀】照常造成伤害', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'qinggang');
  equip(t, 'tengjia');
  await shaHit(api, me, t, 's');
  eq(t.hp, 3, '青釭剑应无视藤甲');
});

test('雌雄双股剑：异性目标弃一张手牌，使用者不摸牌', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  t.sex = 'f';
  equip(me, 'cixiong');
  give(t, 'tao', 'h');
  const s = give(me, 'sha', 's');
  const before = me.hand.length;
  respond({ yesno: () => ({ yes: true }) });
  await api.useCard(me, s, [t], { asId: 'sha' });
  eq(t.hand.length, 0, '目标应弃掉唯一的手牌');
  eq(me.hand.length, before - 1, '使用者不应摸牌（手牌只少了打出的【杀】）');
});

test('雌雄双股剑：目标不弃牌时使用者摸一张', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  t.sex = 'f';
  equip(me, 'cixiong');
  give(t, 'tao', 'h');
  const s = give(me, 'sha', 's');
  const before = me.hand.length;
  deckTop(['tao', 'h']);
  respond({ yesno: (p) => (p === t ? { yes: false } : { yes: true }) });
  await api.useCard(me, s, [t], { asId: 'sha' });
  eq(t.hand.length, 1, '目标应保留手牌');
  eq(me.hand.length, before, '使用者摸一张抵掉打出的【杀】');
});

test('雌雄双股剑：同性目标不触发', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  t.sex = 'm';
  equip(me, 'cixiong');
  give(t, 'tao', 'h');
  const s = give(me, 'sha', 's');
  const before = me.hand.length;
  await api.useCard(me, s, [t], { asId: 'sha' });
  eq(t.hand.length, 1, '同性不触发，目标手牌不变');
  eq(me.hand.length, before - 1, '使用者不摸牌');
});

test('青龙偃月刀：被【闪】抵消后可再使用一张【杀】', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'qinglong');
  const shan = give(t, 'shan', 'h');
  const s2 = give(me, 'sha', 's');
  let dodged = false;
  respond({
    respond: (p, req) => {
      if (req.asId === 'shan' && p === t && !dodged) { dodged = true; return { card: shan }; }
      if (req.asId === 'sha' && p === me) return { card: s2 };
      return null;
    },
  });
  await shaHit(api, me, t, 's');
  eq(dodged, true, '第一张【杀】应被【闪】抵消');
  eq(t.hp, 3, '青龙偃月刀的追击应造成伤害');
});

test('青龙偃月刀：目标没闪就不追击（不需要额外出牌）', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'qinglong');
  const s2 = give(me, 'sha', 's');
  let used = false;
  respond({ respond: (p, req) => { if (req.asId === 'sha' && p === me) { used = true; return { card: s2 }; } return null; } });
  await shaHit(api, me, t, 's');
  eq(t.hp, 3, '直接被命中');
  eq(used, false, '未被抵消时不应询问追击');
});

test('丈八蛇矛：两张手牌当【杀】使用', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0; G.phase = 'play';
  equip(me, 'zhangba');
  const a = give(me, 'tao', 'h');
  const b = give(me, 'wuzhong', 'h');
  eq(await api.useCard(me, a, [t], { asId: 'sha', extraCards: [b] }), true, '应能把两张手牌当【杀】使用');
  eq(t.hp, 3, '视为【杀】应造成 1 点伤害');
  eq(me.hand.length, 0, '两张牌都应离手');
  eq(G.discard.length, 2, '两张牌都应进弃牌堆');
});

test('丈八蛇矛：没装备时两张牌不能当【杀】', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0; G.phase = 'play';
  const a = give(me, 'tao', 'h');
  const b = give(me, 'wuzhong', 'h');
  eq(await api.useCard(me, a, [t], { asId: 'sha', extraCards: [b] }), false, '没丈八蛇矛不能两张当一张');
  eq(t.hp, 4, '目标不应受伤');
});

test('贯石斧：被【闪】抵消后弃两张牌强行命中', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'guanshi');
  const shan = give(t, 'shan', 'h');
  give(me, 'tao', 'h');
  give(me, 'wuzhong', 'h');
  respond({ respond: (p, req) => (req.asId === 'shan' && p === t ? { card: shan } : null) });
  await shaHit(api, me, t, 's');
  eq(t.hp, 3, '弃两张牌后【杀】应依然造成伤害');
  eq(me.hand.length, 0, '应弃掉两张牌');
});

test('贯石斧：手牌不足两张时无法发动', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'guanshi');
  const shan = give(t, 'shan', 'h');
  give(me, 'tao', 'h');                  // 只剩一张（打出的杀已离手）
  respond({ respond: (p, req) => (req.asId === 'shan' && p === t ? { card: shan } : null) });
  await shaHit(api, me, t, 's');
  eq(t.hp, 4, '牌不够时不应强行命中');
  eq(me.hand.length, 1, '手牌不应被弃');
});

test('方天画戟：最后一张手牌【杀】可指定 3 个目标', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 0; G.phase = 'play';
  equip(me, 'fangtian');
  const s = give(me, 'sha', 's');
  eq(await api.useCard(me, s, P.slice(1), { asId: 'sha' }), true);
  eq(P.filter(p => p.hp === 3).length, 3, '三个目标都掉 1 血');
});

test('麒麟弓：造成伤害后可弃置目标的一匹马', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'qilin');
  equip(t, 'dilu');
  await shaHit(api, me, t, 's');
  eq(t.hp, 3, '先造成伤害');
  eq(t.equip.horsePlus, null, '麒麟弓应弃掉目标的一匹马');
});

test('麒麟弓：目标没有坐骑时不询问、不报错', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'qilin');
  await shaHit(api, me, t, 's');
  eq(t.hp, 3);
});

test('古锭刀：目标没有手牌时伤害 +1', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'guding');
  t.hand = [];
  await shaHit(api, me, t, 's');
  eq(t.hp, 2, '空手目标应受到 2 点伤害');
});

test('古锭刀：目标有手牌时仍是 1 点伤害', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'guding');
  give(t, 'tao', 'h');
  respond({ yesno: () => ({ yes: false }) });
  await shaHit(api, me, t, 's');
  eq(t.hp, 3, '有手牌则不加伤');
});

test('朱雀羽扇：普通【杀】可当火【杀】使用（藤甲被点燃）', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'zhuque');
  equip(t, 'tengjia');
  eq(api.canAsFireSha(me, me.hand[0] || mk('sha')), true, '有朱雀羽扇时普通【杀】可视为火【杀】');
  await shaHit(api, me, t, 's', 'huosha');
  eq(t.hp, 2, '火【杀】打藤甲：1 + 1 = 2 点伤害');
});

test('朱雀羽扇：没装备时不能把普通【杀】当火【杀】', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 0;
  eq(api.canAsFireSha(me, mk('sha')), false, '没朱雀羽扇不应允许转化');
});

test('武器攻击范围：装备后能打到更远的角色', async () => {
  const { G, P, api } = game(8);
  const me = P[0], far = P[3];           // 距离 3
  G.current = 0;
  eq(api.inAttackRange(me, far), false, '空手范围 1，打不到距离 3');
  equip(me, 'qinglong');                 // 范围 3
  eq(api.inAttackRange(me, far), true, '青龙偃月刀范围 3，可以打到');
  eq(api.attackRange(me), 3, '攻击范围应取武器数值');
});

/* ---------------- 防具 ---------------- */

group('装备 · 防具');

test('八卦阵：判定为红色视为打出【闪】', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(t, 'bagua');
  deckTop(['tao', 'h']);                 // 红桃 → 判定成功
  await shaHit(api, me, t, 's');
  eq(t.hp, 4, '八卦阵判定成功应免伤');
});

test('八卦阵：判定为黑色仍需自己出【闪】', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(t, 'bagua');
  deckTop(['sha', 's']);                 // 黑桃 → 判定失败
  await shaHit(api, me, t, 's');
  eq(t.hp, 3, '判定失败又没【闪】应受伤');
});

test('八卦阵：可以拒绝发动，直接承受伤害', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(t, 'bagua');
  deckTop(['tao', 'h']);
  respond({ yesno: () => ({ yes: false }) });
  await shaHit(api, me, t, 's');
  eq(t.hp, 3, '不发动就没有判定');
});

test('仁王盾：黑色【杀】无效', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(t, 'renwang');
  await shaHit(api, me, t, 's');          // 黑桃
  eq(t.hp, 4, '黑【杀】应对仁王盾无效');
});

test('仁王盾：红色【杀】照常结算', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(t, 'renwang');
  await shaHit(api, me, t, 'h');          // 红桃
  eq(t.hp, 3, '红【杀】不受仁王盾影响');
});

test('仁王盾：黑色【杀】不能选为目标', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  equip(t, 'renwang');
  const black = mk('sha', 'c');
  const red = mk('sha', 'd');
  eq(api.validTargets(me, 'sha', black).includes(t), false, '黑【杀】不应能指定仁王盾角色');
  eq(api.validTargets(me, 'sha', red).includes(t), true, '红【杀】可以指定');
});

test('藤甲：普通【杀】无效', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(t, 'tengjia');
  const c = mk('sha', 's');
  eq(api.validTargets(me, 'sha', c).includes(t), false, '普通【杀】不应能指定藤甲角色');
  await api.shaAgainst(me, c, 'sha', t, null);
  eq(t.hp, 4, '直接调用结算也应无效');
});

test('藤甲：火【杀】有效且伤害 +1', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(t, 'tengjia');
  await shaHit(api, me, t, 'h', 'huosha');
  eq(t.hp, 2, '火【杀】1 点 + 藤甲 1 点');
});

test('藤甲：【南蛮入侵】与【万箭齐发】无效', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(t, 'tengjia');
  const nm = give(me, 'nanman', 's');
  await api.useCard(me, nm, [], { asId: 'nanman' });
  eq(t.hp, 4, '南蛮对藤甲无效');
  const wj = give(me, 'wanjian', 's');
  await api.useCard(me, wj, [], { asId: 'wanjian' });
  eq(t.hp, 4, '万箭对藤甲无效');
});

test('白银狮子：单次伤害至多 1 点', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  equip(t, 'baiyin');
  await api.damage(me, t, 3, null, null);
  eq(t.hp, 3, '3 点伤害应被压到 1 点');
});

test('白银狮子：失去装备时回复 1 点体力', async () => {
  const { G, P, api } = game(4);
  const t = P[1];
  const c = equip(t, 'baiyin');
  t.hp = 2;
  api.discardCards(t, [c]);
  eq(t.hp, 3, '失去【白银狮子】应回复 1 点体力');
  eq(t.equip.armor, null);
});

test('白银狮子：体力已满时失去不回血', async () => {
  const { G, P, api } = game(4);
  const t = P[1];
  const c = equip(t, 'baiyin');
  t.hp = t.maxHp;
  api.discardCards(t, [c]);
  eq(t.hp, t.maxHp, '满血不应超过上限');
});

/* ---------------- 坐骑 ---------------- */

group('装备 · 坐骑');

test('-1 坐骑：自己计算与别人的距离 -1', async () => {
  const { P, api } = game(8);
  const me = P[0], far = P[4];
  eq(api.distance(me, far), 4, '8 人局 0↔4 距离 4');
  equip(me, 'chitu');
  eq(api.distance(me, far), 3, '赤兔使自己的距离 -1');
});

test('-1 坐骑：不影响别人计算与你的距离', async () => {
  const { P, api } = game(8);
  const me = P[0], far = P[4];
  equip(me, 'chitu');
  eq(api.distance(far, me), 4, '反向距离仍是 4');
});

test('+1 坐骑：别人计算与你的距离 +1', async () => {
  const { P, api } = game(8);
  const me = P[0], far = P[4];
  equip(far, 'dilu');
  eq(api.distance(me, far), 5, '的卢使别人算你的距离 +1');
  eq(api.distance(far, me), 4, '自己算别人不受影响');
});

test('坐骑：七匹马互不冲突，同槽位后者覆盖前者', async () => {
  const { P, api } = game(8);
  const me = P[0], far = P[4];
  equip(me, 'chitu');
  equip(far, 'dilu');
  eq(api.distance(me, far), 4, '4 - 1 + 1 = 4');
  const { equipCard } = api;
  equipCard(me, mk('zixing'));            // 换一匹 -1 坐骑
  eq(me.equip.horseMinus.id, 'zixing', '同槽位应被替换');
  eq(api.distance(me, far), 4, '换马后距离不变');
});

test('七匹坐骑：每一匹都按各自槽位生效', async () => {
  const minus = ['chitu', 'dawan', 'zixing'];
  const plus = ['dilu', 'jueying', 'zhuahuang', 'hualiu'];
  for (const id of minus) {
    const { P, api } = game(8);
    equip(P[0], id);
    eq(api.distance(P[0], P[4]), 3, `${CARD_INFO_NAME(id)} 应使自己算距离 -1`);
  }
  for (const id of plus) {
    const { P, api } = game(8);
    equip(P[4], id);
    eq(api.distance(P[0], P[4]), 5, `${CARD_INFO_NAME(id)} 应使别人算你 +1`);
  }
});

function CARD_INFO_NAME(id) { return mk(id).name; }

/* ---------------- 装备之间的相互影响 ---------------- */

group('装备 · 交互');

test('换防具：白银狮子被替换时回 1 点体力', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 0;
  const old = equip(me, 'baiyin');
  me.hp = 2;
  const neu = give(me, 'bagua', 's');
  await api.useCard(me, neu, [], {});
  eq(me.equip.armor.id, 'bagua', '新防具应就位');
  eq(me.hp, 3, '失去白银狮子应回复 1 点体力');
  eq(G.discard.includes(old), true, '旧防具应进弃牌堆');
});

test('青釭剑被拆掉后，仁王盾重新生效', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'qinggang');
  equip(t, 'renwang');
  me.equip.weapon = null;                 // 模拟被【过河拆桥】拆走
  eq(api.ignoreArmorOf(me), false, '没青釭剑就不无视防具');
  await shaHit(api, me, t, 's');
  eq(t.hp, 4, '黑【杀】应被仁王盾挡住');
});

test('朱雀羽扇：黑色普通【杀】当火【杀】后仍被仁王盾挡（颜色不变）', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'zhuque');
  equip(t, 'renwang');
  await shaHit(api, me, t, 's', 'huosha');   // 黑桃 → 仍是黑牌
  eq(t.hp, 4, '仁王盾只看颜色，火【杀】也挡黑牌');
});

test('朱雀羽扇：红色普通【杀】当火【杀】可绕过仁王盾并点燃藤甲以外的目标', async () => {
  const { G, P, api } = game(4);
  const me = P[0], t = P[1];
  G.current = 0;
  equip(me, 'zhuque');
  equip(t, 'renwang');
  await shaHit(api, me, t, 'h', 'huosha');   // 红桃
  eq(t.hp, 3, '红牌当火【杀】不受仁王盾影响');
});

test('丈八蛇矛：两张牌当【杀】不算「最后一张手牌」，方天画戟不追加目标', async () => {
  const { G, P, api } = game(4);
  const me = P[0];
  G.current = 0; G.phase = 'play';
  const a = give(me, 'tao', 'h');
  give(me, 'wuzhong', 'h');
  await api.equipCard(me, mk('fangtian'));
  eq(api.targetCountRange(me, 'sha', a).max, 1, '手上还有两张牌，不满足「最后一张」');
  eq(await api.useCard(me, a, [P[1], P[2], P[3]], { asId: 'sha' }), true);
  eq(P.filter(x => x.hp === 3).length, 1, '多传的目标应被裁掉，只结算第一个');
});

/* ---------------- 覆盖检查 ---------------- */

group('装备 · 覆盖检查');

test('全部 21 件装备都有对应用例（新增装备记得补测试）', async () => {
  const fs = require('fs');
  const { api } = game(4);
  const ids = Object.keys(api.CARD_INFO).filter(id => api.CARD_INFO[id].type === 'equip');
  eq(ids.length, 21, `装备总数应为 21，实际 ${ids.length}`);
  const src = fs.readFileSync(__filename, 'utf8');
  const miss = ids.filter(id => src.indexOf(`'${id}'`) < 0);
  eq(miss.length, 0, `这些装备没有被测到：${miss.join('、')}`);
});

test('每件装备的效果都有实现（不能只在数据里挂着）', async () => {
  const fs = require('fs'), path = require('path');
  const { api } = game(4);
  const root = path.join(__dirname, '..', '..', 'js');
  const code = ['engine.js', 'skills.js', 'ai.js']
    .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const ids = Object.keys(api.CARD_INFO).filter(id => api.CARD_INFO[id].type === 'equip');
  // 坐骑没有单独分支，统一由 distance() 按槽位计算，不按 id 判断
  const miss = ids.filter(id => {
    const sub = api.CARD_INFO[id].sub;
    if (sub === 'horsePlus' || sub === 'horseMinus') return false;
    return code.indexOf(`'${id}'`) < 0;
  });
  eq(miss.length, 0, `这些装备在引擎里没有任何实现：${miss.join('、')}`);
});
