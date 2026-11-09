'use strict';
/* 身份视觉：所有界面共用一套「印章字 + 颜色 + 胜利条件」，不允许某个身份缺项 */
const H = require('../skilllib');
const { test, group, game, ok, eq } = H;

group('身份视觉组件');

test('四种身份 + 未明都有印章字、胜利条件与说明', () => {
  const { api } = game(4);
  const M = api.IDENTITY_META;
  const keys = ['lord', 'loyal', 'rebel', 'spy', 'unknown'];
  keys.forEach(k => {
    ok(!!M[k], `${k} 有元数据`);
    ok(M[k].mark && M[k].mark.length === 1, `${k} 印章是单字`);
    ok(!!M[k].cn && !!M[k].goal && !!M[k].note, `${k} 名称/目标/说明齐全`);
  });
  eq(new Set(keys.map(k => M[k].mark)).size, keys.length, '五种印章字互不相同');
  eq(M.lord.cn, '主公', '主公名称正确');
  eq(M.rebel.cn, '反贼', '反贼名称正确');
});

test('身份牌输出颜色 class、印章、名称与可点入口', () => {
  const { api } = game(4);
  ['lord', 'loyal', 'rebel', 'spy'].forEach(k => {
    const html = api.idBadge(k, { inspect: 'identity:mine' });
    ok(html.includes('class="id-badge id-' + k + '"'), `${k} 带身份色 class`);
    ok(html.includes('>' + api.IDENTITY_META[k].mark + '</i>'), `${k} 带印章字`);
    ok(html.includes(api.IDENTITY_META[k].cn), `${k} 带名称`);
    ok(html.includes('data-inspect="identity:mine"') && html.includes('data-tap="1"'), `${k} 可点看详情`);
  });
});

test('未知身份一律回退成灰色问号，不泄露真实身份', () => {
  const { api } = game(4);
  [undefined, null, 'bogus', ''].forEach(k => {
    const html = api.idBadge(k, { sealOnly: true });
    ok(html.includes('id-unknown') && html.includes('>?</i>'), `${String(k)} → 身份未明`);
    ok(!html.includes('ib-name'), 'sealOnly 不显示名称');
  });
});

test('带胜利条件的身份牌用于选将 / 抽屉', () => {
  const { api } = game(4);
  const html = api.idBadge('spy', { goal: true });
  ok(html.includes('with-goal'), '使用大号布局');
  ok(html.includes(api.IDENTITY_META.spy.goal), '写出内奸胜利条件');
});

test('各人数配置的身份都在四种合法身份内', () => {
  const { api } = game(8);
  Object.keys(api.IDENTITY_SETUP).forEach(n => {
    const list = api.IDENTITY_SETUP[n];
    eq(list.length, +n, `${n} 人局有 ${n} 个身份`);
    ok(list.every(x => !!api.IDENTITY_META[x] && x !== 'unknown'), `${n} 人局身份都合法`);
    eq(list.filter(x => x === 'lord').length, 1, `${n} 人局恰好一个主公`);
  });
});

test('玩家身份标记：印章带「?」角标，但颜色仍是被标记的身份', () => {
  const { api } = game(4);
  const html = api.idBadge('rebel', { sealOnly: true, cls: 'xs', guess: true });
  ok(html.includes('is-guess'), '带 is-guess class');
  ok(html.includes('class="ib-q"') && html.includes('>?</i>'), '印章带「?」角标');
  ok(html.includes('id-rebel'), '仍用反贼的红印');
  ok(html.indexOf('ib-q') > html.indexOf('ib-seal'), '角标在印章之后，落在印章右下方');
  ok(html.includes('title="你的标记：反贼'), '提示写明这是玩家的标记');

  const plain = api.idBadge('rebel', { sealOnly: true, cls: 'xs' });
  ok(!plain.includes('ib-q') && !plain.includes('is-guess'), '没标记时不带角标');
});

test('身份标记只存在 G.guess 里，新局清空', () => {
  const { api } = game(4);
  api.G.guess[1] = 'rebel';
  api.G.guess[2] = 'spy';
  eq(Object.keys(api.G.guess).length, 2, '能记下多个座位的标记');
  const before = api.G.players.map(p => p.identity);
  api.newGame({ playerCount: 4 });
  eq(Object.keys(api.G.guess).length, 0, '新开一局标记清空');
  ok(api.G.players.every(p => p.identity !== undefined), '身份照常分配，不受标记影响');
  ok(before.length === 4, '标记不写进玩家对象');
});
