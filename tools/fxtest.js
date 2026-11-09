/* 浏览器端验证：杀 → 濒死 → 桃 → 复活，牌桌上有没有「看得见」的表现 */
const { chromium } = require('playwright-core');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const OK = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  await p.goto('http://127.0.0.1:8000/?fast=1&players=4&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 6000 });
  await p.click('.hero .h-name');
  await p.waitForSelector('.seat .gcard', { timeout: 8000 });
  await p.waitForTimeout(500);

  // 停掉观战用的对局循环，但保留原来的 beat 处理器（它带 G.over 判断，可以再打开）
  await p.evaluate(() => { window.__beat = G.beat; G.over = true; });
  await p.waitForTimeout(900);

  await p.evaluate(() => {
    FAST = false;                       // 恢复真实节奏，才能看到中间过程
    G.over = false;
    G.beat = window.__beat;
    G.log = [];
    const me = G.players[0], victim = G.players[1], savior = G.players[2];
    G.players.forEach(x => {
      x.isAI = true; x.hand = []; x.skills = []; x.judgeZone = []; x.flags = {};
      x.armor = null; x.equip = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    });
    victim.hp = 1; victim.maxHp = 4;         // 一张【杀】就濒死
    // 身份固定成「主公打忠臣」，这样第三个角色（同为忠臣）一定会出手救人
    me.identity = 'lord'; victim.identity = 'loyal'; savior.identity = 'loyal';
    savior.hand = [makeCard({ id: 'tao', suit: 'h', num: 3 })];   // 会救人的队友
    const sha = makeCard({ id: 'sha', suit: 's', num: 7 });
    me.hand = [sha]; me.isAI = false;
    G.current = 0; G.phase = 'play';
    UI.render();
    window.__done = false; window.__err = null;
    (async () => {
      await useCard(me, sha, [victim], { asId: 'sha' });
      window.__done = true;
    })().catch(e => { window.__err = String(e && e.message || e); window.__done = true; });
  });

  const tmp = os.tmpdir();
  const seen = { arrow: false, dmg: '', danger: false, tag: false, save: false, heal: '' };
  let shotDying = false, shotSave = false;

  for (let i = 0; i < 60; i++) {
    const s = await p.evaluate(() => ({
      act: document.querySelectorAll('.fx-line.act').length,
      dmg: [...document.querySelectorAll('.fx-hit.dmg')].map(e => e.textContent).join(' '),
      danger: !!document.querySelector('.fx-danger'),
      tag: !!document.querySelector('.fx-tag.danger'),
      save: document.querySelectorAll('.fx-line.save, .fx-label.save').length,
      heal: [...document.querySelectorAll('.fx-hit.heal')].map(e => e.textContent).join(' '),
      banner: (document.getElementById('banner') || {}).textContent || '',
      done: window.__done,
      err: window.__err,
      hp: G.players[1].hp,
      alive: G.players[1].alive,
      saveHp: G.players[2].hand.length,
    }));
    if (s.act) seen.arrow = true;
    if (s.dmg) seen.dmg = s.dmg;
    if (s.danger) seen.danger = true;
    if (s.tag) seen.tag = true;
    if (s.save) seen.save = true;
    if (s.heal) seen.heal = s.heal;

    if (s.danger && !shotDying) {
      shotDying = true;
      await p.screenshot({ path: path.join(tmp, 'fx-dying.png') });
    }
    if (s.save && !shotSave) {
      shotSave = true;
      await p.waitForTimeout(120);
      await p.screenshot({ path: path.join(tmp, 'fx-save.png') });
    }
    if (s.done) { seen.final = s; break; }
    await p.waitForTimeout(110);
  }

  console.log('  中间态：', JSON.stringify({
    arrow: seen.arrow, dmg: seen.dmg, danger: seen.danger, tag: seen.tag, save: seen.save, heal: seen.heal,
  }));

  OK(seen.arrow, '「杀」使用时有行动者 → 目标的指向线');
  OK(/1/.test(seen.dmg || ''), `目标身上出现伤害飘字（${seen.dmg || '无'}）`);
  OK(seen.danger, '濒死时出现血雾（.fx-danger）');
  OK(seen.tag, '濒死时目标身上出现「濒死」标记');
  OK(seen.save, '有人用【桃】时画出救援指向线');
  OK(/\+1/.test(seen.heal || ''), `被救者身上出现回复飘字（${seen.heal || '无'}）`);
  OK(seen.final && seen.final.alive && seen.final.hp >= 1, `被救回：体力 ${seen.final && seen.final.hp}、存活 ${seen.final && seen.final.alive}`);

  // 收尾：血雾应该收掉，别糊在屏幕上
  await p.waitForTimeout(2200);
  const after = await p.evaluate(() => ({
    danger: !!document.querySelector('.fx-danger'),
    hits: document.querySelectorAll('.fx-hit').length,
  }));
  OK(!after.danger, '救援结束后血雾自动清除');
  OK(after.hits === 0, '飘字动画结束后从 DOM 移除（不残留）');

  const logs = await p.evaluate(() => G.log.map(l => l.text).join('\n'));
  console.log('  战报：\n' + logs.split('\n').map(t => '    ' + t).join('\n'));
  console.log(`\n  截图：${tmp}\\fx-dying.png / fx-save.png`);
  if (errs.length) console.log('  报错：' + errs.join(' | '));
  OK(errs.length === 0, '无页面报错');

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
