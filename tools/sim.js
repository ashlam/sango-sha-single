/* 无界面模拟：AI 自动对局，用于验证引擎稳定性 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const sandbox = { console, Math, Date, JSON, Promise, setTimeout, Number, Array, Object, String };
vm.createContext(sandbox);

const bundle = ['data.js', 'engine.js', 'skills.js', 'ai.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
  .join('\n;\n') + `
;globalThis.__APP = { G, newGame, buildDeck, drawCards, gameLoop, AI, GENERALS, log, UI: undefined };`;
vm.runInContext(bundle, sandbox, { filename: 'bundle.js' });

const APP = sandbox.__APP;
Object.assign(sandbox, APP);
const { GENERALS } = sandbox;

function setup(count) {
  sandbox.newGame({ playerCount: count });
  const G = sandbox.G;
  const used = [];
  G.players.forEach(p => {
    const cands = GENERALS.filter(g => !used.includes(g.id));
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

async function runOne(count, idx) {
  const G = setup(count);
  let timeout = false;
  const timer = setTimeout(() => { timeout = true; }, 8000);
  const p = sandbox.gameLoop();
  await Promise.race([p, new Promise(r => setTimeout(r, 8000))]);
  clearTimeout(timer);
  if (timeout) {
    console.log(`✗ 第${idx}局超时！回合数 ${G.turn}，阶段 ${G.phase}，结果 ${G.result}`);
    console.log('存活：', G.players.map(x => `${x.name}(${x.hp}/${x.maxHp})`).join(' '));
    return false;
  }
  if (!G.over) {
    console.log(`✗ 第${idx}局未结束（回合 ${G.turn}）`);
    return false;
  }
  return { camp: G.result, turns: G.turn };
}

(async () => {
  const counts = process.argv[2] ? [+process.argv[2]] : [4, 4, 5, 6];
  const N = process.argv[3] ? +process.argv[3] : 30;
  let ok = 0, fail = 0;
  const stat = {};
  for (let i = 0; i < N; i++) {
    const c = counts[i % counts.length];
    try {
      const r = await runOne(c, i + 1);
      if (r) { ok++; stat[r.camp] = (stat[r.camp] || 0) + 1; }
      else fail++;
    } catch (e) {
      fail++;
      console.log(`✗ 第${i + 1}局异常：${e.message}`);
      console.log(e.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
  console.log(`\n完成：成功 ${ok} / 失败 ${fail}`);
  console.log('胜负分布：', stat);
  process.exit(0);
})();
