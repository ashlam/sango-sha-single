/* 诊断：AI 自战里被引擎拒绝的动作，打印明细 */
const H = require('./skilllib');

const api = H.load();
const ctx = api._ctx;
const origUse = ctx.useCard, origSkill = ctx.useActiveSkill;
let n = 0;

ctx.useCard = async (user, card, targets, opts) => {
  const r = await origUse(user, card, targets, opts);
  if (!r) {
    n++;
    const asId = (opts && opts.asId) || (card && card.id);
    console.log('REJECT useCard', JSON.stringify({
      card: card && card.id, asId,
      user: user.name, isAI: user.isAI,
      targets: (targets || []).map(t => t && t.name),
      legal: ctx.validTargets(user, asId, card).map(t => t.name),
      phase: api.G.phase,
      current: api.G.players[api.G.current] && api.G.players[api.G.current].name,
      hand: user.hand.map(c => c.id),
      shaCount: user.shaCount,
    }));
  }
  return r;
};
ctx.useActiveSkill = async (user, id, extra) => {
  const r = await origSkill(user, id, extra);
  if (!r) {
    n++;
    console.log('REJECT useActiveSkill', JSON.stringify({
      id, user: user.name, phase: api.G.phase,
      current: api.G.players[api.G.current] && api.G.players[api.G.current].name,
    }));
  }
  return r;
};

function aiGame(count) {
  api.newGame({ playerCount: count });
  const G = api.G;
  const used = [];
  G.players.forEach(p => {
    const cands = api.GENERALS.filter(g => !used.includes(g.id));
    const g = cands[Math.floor(Math.random() * cands.length)];
    used.push(g.id);
    Object.assign(p, {
      generalId: g.id, general: g.name, name: g.name, kingdom: g.kingdom,
      sex: g.sex, maxHp: g.hp, hp: g.hp, skills: g.skills.slice(), isAI: true,
    });
  });
  const lord = G.players.find(p => p.identity === 'lord');
  if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }
  api.buildDeck();
  G.players.forEach(p => api.drawCards(p, 4));
  G.current = lord ? lord.seat : 0;
  G.responder = (p, req) => api.AI.decide(p, req);
  return G;
}

(async () => {
  const rounds = +(process.argv[2] || 10);
  for (let i = 0; i < rounds; i++) {
    aiGame(i % 2 ? 8 : 4);
    const done = api.gameLoop();
    const guard = new Promise((_, rej) => setTimeout(() => rej(new Error('超时')), 20000));
    await Promise.race([done, guard]).catch(e => console.log('GAME', i, e.message));
  }
  console.log(`\n共 ${rounds} 局，被拒 ${n} 次`);
})();
