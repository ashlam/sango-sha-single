const fs = require('fs'), vm = require('vm'), path = require('path');
const sandbox = { console, Math, Date, JSON, Promise, setTimeout, Number, Array, Object, String };
vm.createContext(sandbox);
const bundle = ['data.js', 'engine.js', 'skills.js', 'ai.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
  .join('\n;\n') + `;globalThis.__APP = { G, newGame, buildDeck, drawCards, gameLoop, AI, GENERALS };`;
vm.runInContext(bundle, sandbox, { filename: 'bundle.js' });
Object.assign(sandbox, sandbox.__APP);
const { GENERALS } = sandbox;
function setup(count) {
  sandbox.newGame({ playerCount: count });
  const G = sandbox.G, used = [];
  G.players.forEach(p => {
    const cands = GENERALS.filter(g => !used.includes(g.id));
    const g = cands[Math.floor(Math.random() * cands.length)];
    used.push(g.id);
    Object.assign(p, { generalId: g.id, general: g.name, name: g.name, kingdom: g.kingdom, sex: g.sex, maxHp: g.hp, hp: g.hp, skills: g.skills.slice(), isAI: true });
  });
  const lord = G.players.find(p => p.identity === 'lord');
  if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }
  sandbox.buildDeck(); G.players.forEach(p => sandbox.drawCards(p, 4));
  G.current = lord ? lord.seat : 0;
  G.responder = (p, req) => {
    const r = sandbox.AI.decide(p, req);
    reqCount++; lastReq = `${req.kind} <- ${p.general}`;
    return r;
  };
  return G;
}
let reqCount = 0, lastReq = '';
(async () => {
  for (let i = 0; i < 20; i++) {
    reqCount = 0;
    const G = setup(8);
    let ticks = 0;
    const iv = setInterval(() => {
      ticks++;
      console.log(`  [${i}] t=${ticks * 2}s 回合${G.turn} 阶段${G.phase} 当前${G.players[G.current] && G.players[G.current].general} 请求数${reqCount} 最后${lastReq} 存活${G.players.filter(p => p.alive).length} over=${G.over}`);
    }, 2000);
    const t0 = Date.now();
    await sandbox.gameLoop();
    clearInterval(iv);
    console.log(`局${i} 完成 回合${G.turn} 用时${((Date.now() - t0) / 1000).toFixed(1)}s 请求${reqCount}`);
  }
})();
