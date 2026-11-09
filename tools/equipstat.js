/* 装备出场 & 触发统计：跑若干局 AI 自战，统计每件装备被装备/被使用的次数 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const sandbox = { console, Math, Date, JSON, Promise, setTimeout, clearTimeout, Number, Array, Object, String, Set, Map };
vm.createContext(sandbox);
const bundle = ['data.js', 'engine.js', 'skills.js', 'ai.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
  .join('\n;\n') + `
;globalThis.__APP = { G, newGame, buildDeck, drawCards, gameLoop, AI, GENERALS, CARD_INFO, useCard, makeCard };`;
vm.runInContext(bundle, sandbox, { filename: 'bundle.js' });
const APP = sandbox.__APP;
Object.assign(sandbox, APP);

const N = process.argv[2] ? +process.argv[2] : 20;
const COUNT = process.argv[3] ? +process.argv[3] : 8;

function setup() {
  sandbox.newGame({ playerCount: COUNT });
  const G = sandbox.G;
  const used = [];
  G.players.forEach(p => {
    const cands = sandbox.GENERALS.filter(g => !used.includes(g.id));
    const g = cands[Math.floor(Math.random() * cands.length)];
    used.push(g.id);
    p.generalId = g.id;
    p.general = g.name;
    p.name = g.name;
    p.kingdom = g.kingdom;
    p.sex = g.sex;
    p.maxHp = g.hp;
    p.hp = g.hp;
    p.skills = g.skills.slice();
    p.isAI = true;
  });
  const lord = G.players.find(p => p.identity === 'lord');
  if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }
  sandbox.buildDeck();
  G.players.forEach(p => sandbox.drawCards(p, 4));
  G.current = lord ? lord.seat : 0;
  G.responder = (p, req) => sandbox.AI.decide(p, req);
  return G;
}

/* 每件装备：装备次数 / 战报里与它相关的行数 */
const EQUIPS = Object.keys(sandbox.CARD_INFO).filter(id => sandbox.CARD_INFO[id].type === 'equip');
/* 战报里能确认「这件装备真的生效了」的关键字（坐骑 / 连弩没有独立战报） */
const TRIGGER = {
  qinggang: /【青釭剑】/,
  cixiong: /【雌雄双股剑】/,
  qinglong: /【青龙偃月刀】/,
  zhangba: /【丈八蛇矛】/,
  guanshi: /【贯石斧】/,
  fangtian: /【方天画戟】/,
  qilin: /【麒麟弓】/,
  guding: /【古锭刀】/,
  zhuque: /【朱雀羽扇】/,
  bagua: /【八卦阵】/,
  renwang: /【仁王盾】/,
  tengjia: /【藤甲】/,
  baiyin: /【白银狮子】/,
};

(async () => {
  const stat = {};
  EQUIPS.forEach(id => { stat[id] = { name: sandbox.CARD_INFO[id].name, equip: 0, trig: 0 }; });
  let games = 0;
  for (let i = 0; i < N; i++) {
    const G = setup();
    const timer = setTimeout(() => { }, 9000);
    await Promise.race([sandbox.gameLoop(), new Promise(r => setTimeout(r, 9000))]);
    clearTimeout(timer);
    if (!G.over) continue;
    games++;
    for (const line of G.log) {
      const t = line.text || '';
      for (const id of EQUIPS) {
        const nm = stat[id].name;
        if (t.indexOf('装备 ') === 0 || t.indexOf(' 装备 ') > 0) { if (t.indexOf(nm) > 0) stat[id].equip++; }
        const key = TRIGGER[id];
        if (key && key.test(t)) stat[id].trig++;
      }
    }
  }
  console.log(`\n${games} 局（${COUNT} 人局）装备出场统计：\n`);
  console.log('装备            装备次数  触发生效');
  console.log('─'.repeat(42));
  EQUIPS.forEach(id => {
    const s = stat[id];
    const flag = s.equip ? '' : '  ← 一局都没装上';
    const trig = TRIGGER[id] ? String(s.trig).padStart(6) : '     —';
    console.log(`${s.name.padEnd(12, '　')}  ${String(s.equip).padStart(6)}  ${trig}${flag}`);
  });
  const never = EQUIPS.filter(id => !stat[id].equip).map(id => stat[id].name);
  const noTrig = EQUIPS.filter(id => TRIGGER[id] && !stat[id].trig).map(id => stat[id].name);
  console.log(`\n没有装上过的：${never.length ? never.join('、') : '无'}`);
  console.log(`装上过但一次都没触发：${noTrig.length ? noTrig.join('、') : '无'}`);

  // 朱雀羽扇只有在「普通杀打藤甲」时 AI 才会主动转化，真实对局里很少凑齐；
  // 这里补一个最小场景，确认它不是坏了
  if (noTrig.includes('朱雀羽扇')) {
    const r = await probeZhuque();
    console.log(`\n朱雀羽扇定向验证：${r.ok ? '✓' : '✗'} ${r.detail}`);
  }
  process.exit(0);
})();


/* 定向场景：朱雀羽扇把普通【杀】当火【杀】，打藤甲应造成 2 点伤害 */
async function probeZhuque() {
  sandbox.newGame({ playerCount: 4 });
  const G = sandbox.G;
  G.players.forEach(p => {
    p.isAI = false; p.skills = []; p.hand = [];
    p.equip = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    p.hp = 4; p.maxHp = 4; p.alive = true; p.flags = {}; p.marks = {}; p.judgeZone = [];
  });
  G.current = 0; G.phase = 'play'; G.deck = []; G.discard = []; G.log = [];
  G.responder = () => null;
  const me = G.players[0], t = G.players[1];
  me.equip.weapon = sandbox.makeCard({ id: 'zhuque', suit: 's', num: 1 });
  t.equip.armor = sandbox.makeCard({ id: 'tengjia', suit: 's', num: 1 });
  const c = sandbox.makeCard({ id: 'sha', suit: 'h', num: 7 });
  me.hand = [c];
  await sandbox.useCard(me, c, [t], { asId: 'huosha' });
  const logged = G.log.some(l => /【朱雀羽扇】/.test(l.text));
  const ok = t.hp === 2 && logged;
  return { ok, detail: `藤甲目标 ${4 - t.hp} 点伤害（应为 2），战报${logged ? '有' : '没有'}【朱雀羽扇】提示` };
}
