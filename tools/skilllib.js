'use strict';
/* ============================================================
 *  技能单元测试的公共脚手架
 *  - 用 vm 加载 data/engine/skills，不依赖浏览器
 *  - 提供可控场景：牌堆顶、手牌、体力、装备、responder
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['data.js', 'engine.js', 'skills.js', 'ai.js'];

const API_NAMES = [
  'G', 'newGame', 'buildDeck', 'drawOne', 'drawCards', 'gameLoop', 'useCard',
  'shaAgainst', 'resolveSha', 'resolveJuedou', 'damage', 'heal', 'loseHp',
  'discardCards', 'toDiscard', 'cardsOf', 'validTargets', 'judge', 'ask', 'confirm',
  'alivePlayers', 'inAttackRange', 'attackRange', 'distance', 'hasSkill',
  'makeCard', 'makeVirtual', 'removeCardAnywhere', 'gainCards', 'takeFromHand',
  'dying', 'die', 'nextAlive', 'seatOrder', 'targetCountRange', 'playOptions',
  'discardPhase', 'drawPhase', 'playPhase', 'judgePhase', 'useActiveSkill', 'runTurn', 'handLimit', 'pindian', 'resolveCard', 'equipCard',
  'SKILLS', 'CARD_INFO', 'GENERALS', 'IDENTITY_SETUP', 'IDENTITY_META', 'idBadge', 'viewsOf', 'activeAvailable',
  'trySkill', 'afterDrawPhase', 'isShaId', 'isRed', 'isBlack', 'cardName', 'cardText',
  'ignoreArmorOf', 'natureOf', 'recastCard',
  'canAsFireSha', 'canZhangba', 'canShaTarget', 'pickShaCards', 'shaUseOpts', 'playShaCards', 'viewsOf',
  'AI', 'relation', 'canShaThisTurn', 'armorImmune', 'pickSha', 'cardValue',
];

let sandboxCache = null;
function load() {
  if (sandboxCache) return sandboxCache;
  const sandbox = {
    console, Math, Date, JSON, Promise, setTimeout, clearTimeout,
    Number, Array, Object, String, Boolean, parseInt, parseFloat, isNaN, isFinite,
    Set, Map, Symbol, Error, RegExp,
  };
  vm.createContext(sandbox);
  const src = FILES.map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n;\n')
    + `\n;globalThis.__API = { ${API_NAMES.join(', ')} };`
    + `\n;globalThis.__UID = () => UID;`;
  vm.runInContext(src, sandbox, { filename: 'skill-bundle.js' });
  sandboxCache = sandbox.__API;
  sandboxCache._ctx = sandbox;
  sandboxCache._newUid = sandbox.__UID;
  return sandboxCache;
}

const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'];
const IDENTS = ['lord', 'rebel', 'rebel', 'rebel', 'loyal', 'rebel', 'rebel', 'loyal'];

let uidSeq = 90000;
function mk(idOrSpec, suit, num) {
  const api = load();
  let id = idOrSpec, s = suit, n = num;
  if (Array.isArray(idOrSpec)) { id = idOrSpec[0]; s = idOrSpec[1]; n = idOrSpec[2]; }
  else if (typeof idOrSpec === 'object') { id = idOrSpec.id; s = idOrSpec.suit; n = idOrSpec.num; }
  const info = api.CARD_INFO[id];
  if (!info) throw new Error('未知牌 ' + id);
  return {
    uid: uidSeq++,
    id,
    suit: s || (info.type === 'equip' ? 's' : 's'),
    num: n === undefined ? 7 : n,
    name: info.name,
  };
}

/* 开一局干净的对局：无牌堆、无手牌、无技能 */
function game(n) {
  const api = load();
  const count = n || 4;
  api.newGame({ playerCount: count, playerIdentity: 'lord' });
  const G = api.G;
  G.players.forEach((p, i) => {
    p.name = NAMES[i];
    p.general = NAMES[i];
    p.generalId = 'g' + i;
    p.identity = i === 0 ? 'lord' : IDENTS[i] || 'rebel';
    p.skills = [];
    p.hand = [];
    p.marks = {};
    p.flags = {};
    p.judgeZone = [];
    p.equip = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    p.hp = 4;
    p.maxHp = 4;
    p.alive = true;
    p.isAI = false;
    p.shaCount = 0;
    p.usedActive = {};
    p.sex = 'm';
    p.kingdom = 'shu';
    p.flipped = false;
    p.dying = false;
  });
  G.deck = [];
  G.discard = [];
  G.log = [];
  G.over = false;
  G.turn = 1;
  G.current = 0;
  G.processing = null;
  G.responder = defaultResponder;
  return { G, P: G.players, api };
}

/* 默认响应：一律"同意 / 选第一个 / 不出牌" */
function defaultResponder(p, req) {
  switch (req.kind) {
    case 'yesno': return { yes: true };
    case 'discard': {
      const pool = req.pool || (Array.isArray(req.cards) && req.cards.length ? req.cards : p.hand);
      return { cards: pool.slice(0, Math.max(1, req.min || 1)) };
    }
    case 'target': return { targets: (req.candidates || []).slice(0, req.min || 1) };
    case 'choice': return { option: req.options && req.options[0] ? req.options[0].id : null };
    case 'pickOne': return { card: (req.cards || [])[0] || null };
    case 'suit': return { suit: 's' };
    case 'arrange': return { top: req.cards || [], bottom: [] };
    case 'play': return { action: 'end' };
    case 'wuxie': return null;
    case 'save': return null;
    case 'respond': return null;
    default: return null;
  }
}

/* 设置 responder，可覆盖任意 kind；值为函数 (p, req) => response */
function respond(map) {
  const api = load();
  const base = defaultResponder;
  api.G.responder = (p, req) => {
    const h = map[req.kind] || map['*'];
    if (h) return h(p, req);
    return base(p, req);
  };
}

/* 全部拒绝发动技能 / 拒绝弃牌 */
function refuse() {
  respond({
    yesno: () => ({ yes: false }),
    'respond': () => null,
  });
}

function give(p, id, suit, num) {
  const c = mk(id, suit, num);
  p.hand.push(c);
  return c;
}

function giveMany(p, n, id, suit, num) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(give(p, id, suit, num));
  return out;
}

function equip(p, id) {
  const api = load();
  const c = mk(id);
  const sub = api.CARD_INFO[id].sub;
  p.equip[sub] = c;
  return c;
}

/* 设置牌堆：参数从"下一张要抽的牌"开始 */
function deckTop(...specs) {
  const api = load();
  const cards = specs.map(s => (typeof s === 'string' ? mk(s) : mk(s)));
  api.G.deck = cards.slice().reverse();
  return cards;
}

function pushDeck(...specs) {
  const api = load();
  specs.forEach(s => api.G.deck.push(typeof s === 'string' ? mk(s) : mk(s)));
}

function handIds(p) { return p.hand.map(c => c.id); }
function countId(p, id) { return p.hand.filter(c => c.id === id).length; }
function hasCard(p, id) { return countId(p, id) > 0; }
function hasUid(p, uid) { return p.hand.some(c => c.uid === uid); }
function logs(pattern) { return load().G.log.filter(l => pattern.test(l.text)).map(l => l.text); }
function logText() { return load().G.log.map(l => l.text).join('\n'); }
function clearLog() { load().G.log = []; }

/* 让玩家 p 使用一张手牌（走完整引擎流程） */
async function use(p, card, targets, opts) {
  const api = load();
  return api.useCard(p, card, targets || [], opts || {});
}

/* ================= 断言 ================= */

class AssertError extends Error {}
function fail(msg) { throw new AssertError(msg); }
function ok(v, msg) { if (!v) fail(msg || '断言失败'); }
function eq(actual, expected, msg) {
  if (actual !== expected) fail((msg || '值不相等') + `：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}
function eqArr(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) fail((msg || '数组不相等') + `：期望 ${b}，实际 ${a}`);
}
function ne(actual, forbidden, msg) {
  if (actual === forbidden) fail((msg || '值不应相等') + `：都是 ${JSON.stringify(actual)}`);
}

/* ================= 运行器 ================= */

const TESTS = [];
const GROUPS = [];
let currentGroup = '未分组';

function group(name) { currentGroup = name; GROUPS.push(name); }

function test(name, fn) {
  TESTS.push({ name, fn, group: currentGroup });
}

function fuzzTest(name, fn) {
  TESTS.push({ name, fn, group: currentGroup, fuzz: true });
}

async function run(filter) {
  const api = load();
  let pass = 0;
  const fails = [];
  const t0 = Date.now();
  let lastGroup = '';
  for (const t of TESTS) {
    if (filter && !t.name.includes(filter) && !t.group.includes(filter)) continue;
    if (t.group !== lastGroup) { console.log(`\n\x1b[90m── ${t.group} ──\x1b[0m`); lastGroup = t.group; }
    uidSeq = 90000;
    try {
      await t.fn({ api });
      pass++;
      console.log(`  \x1b[32m✓\x1b[0m ${t.name}`);
    } catch (e) {
      const msg = e instanceof AssertError ? e.message : (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
      fails.push({ name: t.name, group: t.group, msg });
      console.log(`  \x1b[31m✗ ${t.name}\x1b[0m\n      \x1b[31m${msg}\x1b[0m`);
    }
  }
  console.log(`\n\x1b[1m结果：${pass} 通过 / ${fails.length} 失败 / 共 ${pass + fails.length} 项（${Date.now() - t0}ms）\x1b[0m`);
  if (fails.length) {
    console.log('\n失败汇总：');
    fails.forEach(f => console.log(`  · [${f.group}] ${f.name} —— ${f.msg.split('\n')[0]}`));
  }
  return fails.length;
}

module.exports = {
  load, game, respond, refuse, defaultResponder,
  give, giveMany, equip, deckTop, pushDeck, mk,
  handIds, countId, hasCard, hasUid, logs, logText, clearLog,
  use, ok, eq, eqArr, ne, fail, AssertError,
  group, test, fuzzTest, run, TESTS,
};
