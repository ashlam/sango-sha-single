'use strict';
/* ============================================================
 *  三国杀 · 单机版   —— 启动与流程
 * ============================================================ */

let AUTO_MODE = false;
let FAST = false;

/* 上一局的选择：人数等开局选项存在本机，下次进来默认沿用 */
const SETTINGS_KEY = 'sgs.settings.v1';
let SETTINGS = (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
})();
function saveSettings(patch) {
  SETTINGS = Object.assign({}, SETTINGS, patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) { /* 隐私模式忽略 */ }
}
window.saveSettings = saveSettings;

function applySavedOptions() {
  const sel = document.getElementById('selCount');
  if (!sel) return;
  const saved = SETTINGS.playerCount;
  if (saved && sel.querySelector(`option[value="${saved}"]`)) sel.value = String(saved);
}

function bindStart() {
  document.getElementById('btnStart').addEventListener('click', () => startGame());
  document.getElementById('btnRule').addEventListener('click', () => showGuide());
  bindUI();
  initInspect();
  const params = new URLSearchParams(location.search);
  FAST = params.get('fast') === '1';
  applySavedOptions();
  // ?players=8 可直接指定人数（方便分享 / 测试），优先级高于本机记忆
  const pc = params.get('players');
  if (pc && document.querySelector(`#selCount option[value="${pc}"]`)) {
    document.getElementById('selCount').value = pc;
  }
  if (params.get('auto') === '1') { AUTO_MODE = true; startGame(); }
}

async function startGame() {
  const count = +(document.getElementById('selCount').value || 4);
  saveSettings({ playerCount: count });
  newGame({ playerCount: count });

  const me = G.players[0];
  const isLord = me.identity === 'lord';
  const pool = pickGeneralPool(3, []);
  const chosen = AUTO_MODE ? pool[0] : await pickGeneralForPlayer(pool);
  closeModal();

  assignGeneral(me, chosen);

  // 其余角色随机分配
  const used = [me.generalId];
  for (let i = 1; i < G.players.length; i++) {
    const cands = GENERALS.filter(g => !used.includes(g.id));
    const g = cands[Math.floor(Math.random() * cands.length)];
    used.push(g.id);
    assignGeneral(G.players[i], g);
  }

  // 主公体力上限 +1
  const lord = G.players.find(p => p.identity === 'lord');
  if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }

  buildDeck();

  // 界面先搭起来，发牌动画才有地方落
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('hidden');
  // 换局时清空座位 DOM
  document.getElementById('seats').innerHTML = '';
  UI.seatEls = {};
  if (window.FX) window.FX.clear();

  log('对局开始', 'turn');
  UI.render();

  // 起手四张：默认慢慢发（洗牌 → 一张张飞到武将卡上）；快速模式直接发完
  await UI.dealIntro({ skip: FAST || AUTO_MODE });
  UI.render();

  // 展示节拍：引擎每个关键动作后暂停，让玩家看清发生了什么
  // （sleep 定义在 ui.js，加载顺序在 main.js 之前）
  G.beat = async (ev, d) => {
    if (G.over) return;
    const isAI = d.player ? d.player.seat !== 0 : true;
    if (ev === 'turn') {
      showTurnBanner(d);
      await sleep(FAST ? 0 : (isAI ? 1000 : 650));
    } else if (ev === 'phase') {
      showPhaseBanner(d);
      await sleep(FAST ? 0 : (isAI ? 520 : 260));
    } else if (ev === 'card') {
      showPlayBanner(d);
      await sleep(FAST ? 60 : (isAI ? 1250 : 700));
    } else if (ev === 'dmg') {
      showDmgBanner(d);
      await sleep(FAST ? 0 : 620);
    } else if (ev === 'dying') {
      showDyingBanner(d);
      await sleep(FAST ? 0 : 780);
    } else if (ev === 'save') {
      showSaveBanner(d);
      await sleep(FAST ? 0 : 700);
    } else if (ev === 'heal') {
      // 回复只在目标身上飘一个 +N；不弹横幅，避免群体治疗时刷屏
      if (window.FX) window.FX.heal(d.target.seat, d.amount);
      await sleep(FAST ? 0 : 220);
    } else if (ev === 'death') {
      showDeathBanner(d);
      await sleep(FAST ? 0 : 720);
    }
  };

  // 响应器
  G.responder = async (p, req) => {
    if (G.over) return null;
    if (p.isAI || AUTO_MODE) {
      if (!AUTO_MODE) await sleep(FAST ? 0 : 260 + Math.random() * 200);
      return await AI.decide(p, req);
    }
    return await UI.prompt(p, req);
  };

  // 主公先手
  G.current = lord ? lord.seat : 0;

  try {
    await gameLoop();
  } catch (e) {
    console.error(e);
    log('运行出错：' + e.message, 'bad');
  }
}

function assignGeneral(p, g) {
  p.generalId = g.id;
  p.general = g.name;
  p.name = g.name;
  p.kingdom = g.kingdom;
  p.sex = g.sex;
  p.maxHp = g.hp;
  p.hp = g.hp;
  p.skills = g.skills.slice();
  p.isAI = p.seat !== 0 || AUTO_MODE;
}

function pickGeneralForPlayer(cands) {
  return new Promise(resolve => {
    const me = G.players[0];
    const meta = IDENTITY_META[me.identity] || IDENTITY_META.unknown;
    openModal(`
      <div class="m-title">选择武将</div>
      <div class="pick-id">
        ${idBadge(me.identity, { goal: true, inspect: 'identity:mine' })}
        <div class="pick-id-note">你的身份 · ${meta.note}　<span>点身份牌可查看各阵营目标</span></div>
      </div>
      <div class="hero-list" id="heroList"></div>
      <div class="hero-tip">点技能名可看完整说明　·　点武将名选定</div>
    `, box => {
      const list = box.querySelector('#heroList');
      cands.forEach(g => {
        const el = h('div', 'hero');
        const skills = g.skills.map(sid => {
          const sk = SKILLS[sid];
          if (!sk) return '';
          return `<span class="h-skill" data-skill="${sid}">${sk.name}<i class="h-more">ⓘ</i></span>`;
        }).join('');
        el.innerHTML = `
          <div class="h-kingdom">${KINGDOM_CN[g.kingdom]}</div>
          <div class="h-name">${g.name}</div>
          <div class="h-hp">${'<i class="dot"></i>'.repeat(g.hp)}</div>
          <div class="h-skills">${skills}</div>
        `;
        el.onclick = () => { closeModal(); resolve(g); };
        // 技能名可单独点开看说明（手机上没有 title 提示）
        el.querySelectorAll('.h-skill').forEach(sc => {
          sc.onclick = ev => {
            ev.stopPropagation();
            openSkillSheet(sc.dataset.skill);
          };
        });
        list.appendChild(el);
      });
    });
  });
}

window.addEventListener('DOMContentLoaded', bindStart);
