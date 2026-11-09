'use strict';
/* 统计 AI 在出牌阶段被引擎拒绝的动作，定位「空转」来源 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const sandbox = { console, Math, Date, JSON, Promise, setTimeout, Number, Array, Object, String, Boolean, Set, Map };
vm.createContext(sandbox);
const bundle = ['data.js', 'engine.js', 'skills.js', 'ai.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
  .join('\n;\n')
  + `;globalThis.__APP = { G, newGame, buildDeck, drawCards, gameLoop, AI, GENERALS, validTargets, cardsOf, CARD_INFO };`;
vm.runInContext(bundle, sandbox, { filename: 'bundle.js' });
Object.assign(sandbox, sandbox.__APP);
const { GENERALS } = sandbox;

const fails = [];
const origUse = sandbox.useCard;
sandbox.useCard = async function (user, card, targets, opts) {
  const asId0 = (opts && opts.asId) || card.id;
  const legalBefore = sandbox.validTargets(user, asId0, card).map(p => p.name);
  const phaseBefore = sandbox.G.phase;
  const curBefore = sandbox.G.current;
  const r = await origUse(user, card, targets, opts);
  if (!r) {
    const asId = asId0;
    const info = sandbox.CARD_INFO[asId];
    const legal = legalBefore;
    fails.push({
      turn: sandbox.G.turn,
      who: user.general || user.name,
      as: info.name,
      targets: (targets || []).map(p => `${p.general}(藤甲:${p.equip.armor && p.equip.armor.id === 'tengjia' ? '有' : '无'})`).join(',') || '无',
      legal: legal.join(',') || '无',
      shaCount: user.shaCount,
      phase: phaseBefore,
      isCurrent: curBefore === user.seat,
      inPhase: phaseBefore === 'play' && curBefore === user.seat,
      stack: new Error().stack.split('\n').slice(1, 4).map(x => x.trim().replace(/^at /, '')).join(' ← '),
      opts: JSON.stringify(opts || {}),
      weapon: user.equip.weapon && user.equip.weapon.id,
      targetLegal: (targets || []).map(p => legalBefore.includes(p.name)),
      inHandNow: user.hand.includes(card) || Object.values(user.equip).includes(card),
      living: user.alive,
      inHand: user.hand.some(c => c === card),
      paoxiao: user.skills.includes('paoxiao'),
      weapon: user.equip.weapon && user.equip.weapon.id,
    });
  }
  return r;
};

function setup(count) {
  sandbox.newGame({ playerCount: count });
  const G = sandbox.G, used = [];
  G.players.forEach(p => {
    const cands = GENERALS.filter(g => !used.includes(g.id));
    const g = cands[Math.floor(Math.random() * cands.length)];
    used.push(g.id);
    Object.assign(p, {
      generalId: g.id, general: g.name, name: g.name, kingdom: g.kingdom, sex: g.sex,
      maxHp: g.hp, hp: g.hp, skills: g.skills.slice(), isAI: true,
    });
  });
  const lord = G.players.find(p => p.identity === 'lord');
  if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }
  sandbox.buildDeck();
  G.players.forEach(p => sandbox.drawCards(p, 4));
  G.current = lord ? lord.seat : 0;
  G.responder = (p, req) => sandbox.AI.decide(p, req);
  return G;
}

(async () => {
  const N = Number(process.argv[2] || 10);
  for (let i = 0; i < N; i++) {
    setup(8);
    await sandbox.gameLoop();
  }
  console.log(`8 人 ${N} 局，被拒绝的出牌 ${fails.length} 次`);
  const byType = {};
  fails.forEach(f => { const k = `${f.as}（目标合规:${f.legal === '无' ? '无' : '有'}）`; byType[k] = (byType[k] || 0) + 1; });
  Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(`  ${v} 次  ${k}`));
  fails.slice(0, 10).forEach(f => console.log(`  · 回合${f.turn} ${f.who} 【${f.as}】shaCount=${f.shaCount} 武器=${f.weapon || '无'} opts=${f.opts} 目标合法=${f.targetLegal} 牌在手=${f.inHandNow} 存活=${f.living}\n     ${f.stack}`));
})();
