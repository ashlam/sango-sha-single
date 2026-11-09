'use strict';
/* 五、流离、南蛮免疫，以及「每个技能都有测试」的覆盖率检查 */
const H = require('../skilllib');
const { test, group, game, give, giveMany, equip, deckTop, ok, eq, eqArr, ne } = H;
const fs = require('fs');
const path = require('path');

group('流离（转移【杀】）');

test('流离：弃一张牌把【杀】转给攻击范围内的第三人，自己不受伤害', async () => {
  const { P, api } = game(4);
  const a = P[0], daqiao = P[1], victim = P[2];
  daqiao.skills = ['liuli'];
  const fodder = give(daqiao, 'shan');
  H.respond({
    yesno: () => ({ yes: true }),                 // 同意发动流离
    target: () => ({ targets: [victim] }),        // 转给 2 号位
    discard: (p) => ({ cards: [fodder] }),        // 弃置那张闪
    respond: () => null,                          // 谁都不出闪
  });
  await api.useCard(a, give(a, 'sha'), [daqiao], { asId: 'sha' });
  eq(daqiao.hp, 4, '大乔不该受伤');
  eq(victim.hp, 3, '被转移的目标应受伤');
  ok(!H.hasUid(daqiao, fodder.uid), '应弃置一张牌');
  ok(H.logs(/流离/).length > 0, '日志里应有流离');
});

test('流离：不发动则照常结算伤害', async () => {
  const { P, api } = game(4);
  const a = P[0], daqiao = P[1];
  daqiao.skills = ['liuli'];
  give(daqiao, 'shan');
  H.respond({ yesno: () => ({ yes: false }), respond: () => null });
  await api.useCard(a, give(a, 'sha'), [daqiao], { asId: 'sha' });
  eq(daqiao.hp, 3, '没发动流离就正常受伤');
});

test('流离：没有可转移的目标时不发动，也不弃牌', async () => {
  const { P, api } = game(4);
  const a = P[0], daqiao = P[1];
  P[2].alive = false; P[3].alive = false;   // 场上只剩【杀】的使用者和大乔
  daqiao.skills = ['liuli'];
  const fodder = give(daqiao, 'shan');
  H.respond({ yesno: () => ({ yes: true }), respond: () => null });
  await api.useCard(a, give(a, 'sha'), [daqiao], { asId: 'sha' });
  ok(H.hasUid(daqiao, fodder.uid), '不该弃牌');
  eq(daqiao.hp, 3, '仍然受伤');
});

test('流离：转换后的【杀】仍然只有 1 点伤害（不会重复结算）', async () => {
  const { P, api } = game(4);
  const a = P[0], daqiao = P[1], victim = P[2];
  daqiao.skills = ['liuli'];
  give(daqiao, 'shan');
  H.respond({
    yesno: () => ({ yes: true }),
    target: () => ({ targets: [victim] }),
    discard: (p) => ({ cards: p.hand.slice(0, 1) }),
    respond: () => null,
  });
  await api.useCard(a, give(a, 'sha'), [daqiao], { asId: 'sha' });
  eq(victim.hp, 3, '只掉 1 点');
  eq(daqiao.hp, 4, '大乔不掉血');
});

group('南蛮入侵 · 免疫与获得');

test('祸首：南蛮入侵对其无效', async () => {
  const { P, api } = game(4);
  const user = P[0], t = P[2];
  t.skills = ['huoshou'];
  H.respond({ respond: () => null });
  await api.useCard(user, give(user, 'nanman'), [], { asId: 'nanman' });
  eq(t.hp, 4, '祸首应免疫南蛮');
  eq(P[1].hp, 3, '其他人照常受伤');
});

test('巨象：南蛮入侵对其无效', async () => {
  const { P, api } = game(4);
  const user = P[0], t = P[2];
  t.skills = ['juxiang'];
  H.respond({ respond: () => null });
  await api.useCard(user, give(user, 'nanman'), [], { asId: 'nanman' });
  eq(t.hp, 4, '巨象应免疫南蛮');
});

test('祸首：其他角色使用【南蛮入侵】后获得之', async () => {
  const { P, api } = game(4);
  const user = P[0], t = P[2];
  t.skills = ['huoshou'];
  const nm = give(user, 'nanman');
  H.respond({ respond: () => null });
  await api.useCard(user, nm, [], { asId: 'nanman' });
  ok(H.hasUid(t, nm.uid), '结算后应获得这张【南蛮入侵】');
});

test('巨象：同理获得结算完的【南蛮入侵】', async () => {
  const { P, api } = game(4);
  const user = P[0], t = P[2];
  t.skills = ['juxiang'];
  const nm = give(user, 'nanman');
  H.respond({ respond: () => null });
  await api.useCard(user, nm, [], { asId: 'nanman' });
  ok(H.hasUid(t, nm.uid), '结算后应获得这张【南蛮入侵】');
});

group('技能表一致性');

test('每个武将的技能都在 SKILLS 表里有定义', () => {
  const { api } = game(4);
  const missing = [];
  api.GENERALS.forEach(g => {
    (g.skills || []).forEach(sid => { if (!api.SKILLS[sid]) missing.push(`${g.name}(${g.id}) → ${sid}`); });
  });
  eq(missing.length, 0, '缺少技能定义：' + missing.join('、'));
});

test('每个技能都有名字和描述', () => {
  const { api } = game(4);
  const bad = Object.keys(api.SKILLS).filter(k => {
    const s = api.SKILLS[k];
    return !s.name || !s.desc || s.desc.length < 4;
  });
  eq(bad.length, 0, '描述缺失：' + bad.join('、'));
});

test('每个技能都有武将拥有（没有孤儿技能）', () => {
  const { api } = game(4);
  const owned = new Set();
  api.GENERALS.forEach(g => (g.skills || []).forEach(s => owned.add(s)));
  const orphans = Object.keys(api.SKILLS).filter(k => !owned.has(k));
  eq(orphans.length, 0, '没有武将拥有的技能：' + orphans.join('、'));
});

/* 覆盖率：测试源码里必须出现技能 id，否则视为没测 */
test('每个技能都被至少一条测试覆盖', () => {
  const { api } = game(4);
  const dir = __dirname;
  const src = fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
  const untested = Object.keys(api.SKILLS).filter(id => !src.includes(`'${id}'`));
  eq(untested.length, 0, '未覆盖的技能：' + untested.map(id => `${id}(${api.SKILLS[id].name})`).join('、'));
});
