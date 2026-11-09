/* 诊断：出牌阶段 AI 是否反复选择同一张牌导致空转 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const sandbox = { console, Math, Date, JSON, Promise, setTimeout, Number, Array, Object, String };
vm.createContext(sandbox);
const bundle = ['data.js', 'engine.js', 'skills.js', 'ai.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
  .join('\n;\n') + `
;globalThis.__APP = { G, newGame, buildDeck, drawCards, gameLoop, AI, GENERALS };`;
vm.runInContext(bundle, sandbox, { filename: 'bundle.js' });
const APP = sandbox.__APP; Object.assign(sandbox, APP);
const { GENERALS } = sandbox;

function setup(count) {
  sandbox.newGame({ playerCount: count });
  const G = sandbox.G; const used = [];
  G.players.forEach(p => {
    const g = GENERALS.filter(g => !used.includes(g.id))[Math.floor(Math.random() * (GENERALS.length - used.length))];
    used.push(g.id);
    p.generalId = g.id; p.general = g.name; p.name = g.name;
    p.kingdom = g.kingdom; p.sex = g.sex; p.maxHp = g.hp; p.hp = g.hp;
    p.skills = g.skills.slice(); p.isAI = true;
  });
  const lord = G.players.find(p => p.identity === 'lord');
  if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }
  sandbox.buildDeck(); G.players.forEach(p => sandbox.drawCards(p, 4));
  G.current = lord ? lord.seat : 0;
  return G;
}

(async () => {
  for (let run = 0; run < 5; run++) {
    const G = setup(8);
    let rep = 0, lastKey = '', repeat = 0;
    G.responder = (p, req) => {
      const r = sandbox.AI.decide(p, req);
      if (req.kind === 'play' && r && r.action === 'use') {
        const key = p.seat + ':' + r.card.uid;
        if (key === lastKey) repeat++;
        else { if (repeat >= 2) console.log(`  !! ${p.general} 连续 ${repeat + 1} 次选同一张 ${r.card.name} (回合${G.turn} shaCount=${p.shaCount})`);
          repeat = 0; lastKey = key; }
        if (repeat === 2) rep++;
      } else { if (repeat >= 2) console.log(`  !! ${p.general} 连续 ${repeat + 1} 次选同一张 (回合${G.turn})`); repeat = 0; lastKey = ''; }
      return r;
    };
    try { await sandbox.gameLoop(); } catch (e) { console.log('run', run, 'ERR', e.message); }
    console.log(`run${run}: 回合${G.turn} 结束 over=${G.over} 反复组=${rep}`);
  }
})();
