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
  G.responder = (p, req) => sandbox.AI.decide(p, req);
  return G;
}
(async () => {
  let stalled = 0, totals = 0, turns = 0, wins = {};
  for (let i = 0; i < 20; i++) {
    const G = setup(8);
    await sandbox.gameLoop();
    totals++;
    turns += G.turn;
    const s = G.log.filter(l => /没有可执行的动作/.test(l.text)).length;
    stalled += s;
    const r = G.log.filter(l => /游戏结束/.test(l.text)).pop();
    if (r) wins[r.text.replace('游戏结束 —— ', '')] = (wins[r.text.replace('游戏结束 —— ', '')] || 0) + 1;
  }
  console.log(`8人 20局: 平均回合 ${(turns / totals).toFixed(1)}, 出牌阶段空转熔断 ${stalled} 次`);
  console.log('胜负:', wins);
})();
