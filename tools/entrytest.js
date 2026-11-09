/* 详情入口回归：横幅里的牌/名字/目标、中央牌、回合名、战报词条 */
const { chromium } = require('playwright-core');

const OK = (c, m) => console.log((c ? '  ok   ' : '  FAIL ') + m);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 5000 });
  await p.click('.hero .h-name');
  await p.waitForSelector('.seat .gcard', { timeout: 5000 });
  await p.waitForTimeout(300);
  // 冻结引擎，保证测试期间横幅不被真实行动覆盖
  await p.evaluate(() => {
    window.__beat = G.beat;
    G.beat = async () => {};
    G.responder = () => new Promise(() => {});
  });
  await p.waitForTimeout(400);

  /* 1. 横幅里的牌 → 牌详情 */
  await p.evaluate(() => {
    window.__p1 = G.players[1];
    showPlayBanner({ player: G.players[1], card: { id: 'sha', suit: 'h', num: 7, uid: 90001, name: '杀' }, targets: [G.players[0]] });
  });
  await p.waitForTimeout(120);
  const box = await p.evaluate(() => {
    const r = document.querySelector('#banner .bn-card').getBoundingClientRect();
    return { w: r.width, h: r.height, pe: getComputedStyle(document.querySelector('#banner .bn-card')).pointerEvents };
  });
  OK(box.w > 30 && box.pe === 'auto', `横幅牌可点 (${Math.round(box.w)}x${Math.round(box.h)}, pointer-events=${box.pe})`);
  await p.click('#banner .bn-card');
  await p.waitForTimeout(200);
  const r1 = await p.evaluate(() => ({
    open: !document.getElementById('sheet').classList.contains('hidden'),
    name: (document.querySelector('.insp-cname') || {}).textContent,
    title: (document.querySelector('.sheet-title') || {}).textContent,
  }));
  OK(r1.open && r1.name === '杀', `点横幅牌打开详情 (${r1.title} / ${r1.name})`);
  await p.click('#sheetClose');
  await p.waitForTimeout(150);

  /* 2. 横幅里的武将名 → 武将详情 */
  await p.click('#banner .bn-who');
  await p.waitForTimeout(200);
  const r2b = await p.evaluate(() => ({
    title: (document.querySelector('.sheet-title') || {}).textContent,
    want: G.players[1].general,
    skills: document.querySelectorAll('#sheetBody .sk-row').length,
  }));
  OK(r2b.title === r2b.want && r2b.skills > 0, `点横幅武将名打开武将详情 (${r2b.title}, ${r2b.skills} 技能/装备行)`);
  await p.click('#sheetClose');
  await p.waitForTimeout(150);

  /* 3. 目标名可点 */
  await p.click('#banner .bn-targets .bn-p');
  await p.waitForTimeout(200);
  const r3 = await p.evaluate(() => ({
    title: (document.querySelector('.sheet-title') || {}).textContent,
    want: G.players[0].general,
  }));
  OK(r3.title === r3.want, `点横幅目标名打开武将详情 (${r3.title})`);
  await p.click('#sheetClose');
  await p.waitForTimeout(150);

  /* 4. 三个目标 → 聚合入口 → 目标列表 */
  await p.evaluate(() => {
    const tg = G.players.filter(x => x.seat !== 1).slice(0, 3);
    showPlayBanner({ player: G.players[1], card: { id: 'nanman', suit: 's', num: 7, uid: 90002, name: '南蛮入侵' }, targets: tg });
  });
  await p.waitForTimeout(120);
  await p.click('#banner .bn-targets');
  await p.waitForTimeout(200);
  const r4 = await p.evaluate(() => ({
    sub: (document.querySelector('.sheet-sub') || {}).textContent,
    rows: document.querySelectorAll('#sheetBody .sk-row').length,
  }));
  OK(r4.rows === 3, `多目标横幅 → 目标列表 (${r4.rows} 行 / ${r4.sub})`);
  await p.click('#sheetBody .sk-row');
  await p.waitForTimeout(200);
  const r4a = await p.evaluate(() => (document.querySelector('.sheet-title') || {}).textContent);
  await p.evaluate(() => SHEET.back());
  await p.waitForTimeout(150);
  const r4b = await p.evaluate(() => (document.querySelector('.sheet-title') || {}).textContent);
  OK(!!r4a && r4b === '目标', `目标列表 → 武将 → 可返回 (${r4a} → ${r4b})`);
  await p.click('#sheetClose');
  await p.waitForTimeout(150);

  /* 5. 转化技：当【杀】入口 */
  await p.evaluate(() => showPlayBanner({
    player: G.players[1], card: { id: 'tao', suit: 'h', num: 3, uid: 90003, name: '桃' },
    asId: 'sha', targets: [G.players[0]],
  }));
  await p.waitForTimeout(120);
  const asTxt = await p.evaluate(() => (document.querySelector('#banner .bn-as') || {}).textContent);
  OK(asTxt === '当【杀】', `转化牌显示视为牌 (${asTxt})`);
  await p.click('#banner .bn-card');
  await p.waitForTimeout(200);
  const r5 = await p.evaluate(() => ({
    title: (document.querySelector('.sheet-title') || {}).textContent,
    as: !!document.querySelector('#sheetBody .insp-state.ok'),
  }));
  OK(r5.as && r5.title.indexOf('杀') > 0, `转化说明 (${r5.title})`);
  await p.click('#sheetClose');
  await p.waitForTimeout(150);

  /* 6. 中央结算牌 */
  await p.evaluate(() => {
    G.processing = { id: 'wuzhong', suit: 'd', num: 3, uid: 90004, name: '无中生有' };
    UI.render();
  });
  await p.waitForTimeout(150);
  const pe = await p.evaluate(() => getComputedStyle(document.getElementById('processSlot')).pointerEvents);
  OK(pe === 'auto', `中央牌区可点 (pointer-events=${pe})`);
  await p.click('#processSlot .card');
  await p.waitForTimeout(200);
  const r6 = await p.evaluate(() => (document.querySelector('.sheet-title') || {}).textContent);
  OK(r6 === '无中生有', `点中央牌打开详情 (${r6})`);
  await p.click('#sheetClose');
  await p.waitForTimeout(150);

  /* 7. 回合名 */
  await p.click('#turnName');
  await p.waitForTimeout(200);
  const r7 = await p.evaluate(() => ({
    title: (document.querySelector('.sheet-title') || {}).textContent,
    want: G.players[G.current].general,
  }));
  OK(r7.title === r7.want, `点回合名打开武将详情 (${r7.title})`);
  await p.click('#sheetClose');
  await p.waitForTimeout(150);

  /* 8. 战报词条 */
  await p.click('#btnLog');
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    log(`${G.players[1].name} 使用 ♥5·【杀】`, 'use');
    log(`${G.players[0].name} 受到 1 点伤害（来自 ${G.players[1].name}）`, 'dmg');
    log(`${G.players[1].name} 装备 ♠7·青釭剑`, 'equip');
  });
  await p.waitForTimeout(200);
  const r8 = await p.evaluate(() => {
    const list = document.getElementById('logList');
    const rows = [...list.children].slice(-3);
    const info = rows.map(r => ({ w: r.querySelectorAll('.lg-who').length, k: r.querySelectorAll('.lg-kw').length }));
    const tok = rows[2].querySelector('.lg-kw');
    return { info, suit: tok && tok.dataset.suit, num: tok && tok.dataset.num };
  });
  OK(r8.info[0].w === 1 && r8.info[0].k === 1 && r8.info[1].w === 2 && r8.info[2].k === 1,
    `战报词条 (武将 ${r8.info.map(x => x.w).join('/')}, 牌 ${r8.info.map(x => x.k).join('/')})`);
  OK(r8.suit === 's' && r8.num === '7', `带花色牌解析 (${r8.suit}${r8.num})`);
  await p.locator('#logList .lg-who').last().click();
  await p.waitForTimeout(250);
  const r9 = await p.evaluate(() => (document.querySelector('.sheet-title') || {}).textContent);
  OK(!!r9, `点战报武将名打开详情 (${r9})`);
  await p.click('#sheetClose');
  await p.waitForTimeout(150);
  await p.locator('#logList .lg-kw').last().click();
  await p.waitForTimeout(250);
  const r10 = await p.evaluate(() => ({
    title: (document.querySelector('.sheet-title') || {}).textContent,
    sub: (document.querySelector('.sheet-sub') || {}).textContent,
  }));
  OK(r10.title === '青釭剑' && r10.sub.indexOf('♠7') === 0, `点战报牌打开详情 (${r10.title} / ${r10.sub})`);
  await p.click('#sheetClose');
  await p.locator('#logList .lg-kw').first().click();
  await p.waitForTimeout(250);
  const r10b = await p.evaluate(() => (document.querySelector('.sheet-title') || {}).textContent);
  OK(!!r10b, `点战报【书名号】牌打开详情 (${r10b})`);
  await p.click('#sheetClose');
  await p.evaluate(() => closeLog());

  /* 9. 观战模式：真实对局里的横幅确实可点 */
  const sp = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const serrs = [];
  sp.on('pageerror', e => serrs.push('PAGEERROR ' + e.message));
  await sp.goto('http://127.0.0.1:8000/?auto=1&players=4&t=' + Date.now(), { waitUntil: 'networkidle' });
  await sp.waitForSelector('.seat .gcard', { timeout: 6000 });
  let hit = '';
  for (let i = 0; i < 8 && !hit; i++) {
    await sp.waitForSelector('#banner:not(.hidden) .bn-card', { timeout: 15000 }).catch(() => {});
    await sp.click('#banner .bn-card', { timeout: 2000 }).catch(() => {});
    await sp.waitForTimeout(180);
    hit = await sp.evaluate(() => {
      const s = document.getElementById('sheet');
      return s && !s.classList.contains('hidden') ? (document.querySelector('.sheet-title') || {}).textContent : '';
    });
  }
  OK(!!hit, `真实对局点横幅牌打开详情 (${hit || '未命中'})`);
  const r11 = await sp.evaluate(() => {
    const b = document.getElementById('banner');
    return { visible: !b.classList.contains('hidden'), acts: b.querySelectorAll('[data-act]').length };
  });
  console.log(`     横幅元素 ${r11.acts} 个可点 / ${r11.visible ? '显示中' : '已收起'}`);
  console.log(serrs.length ? 'SPECTATE ERRORS: ' + serrs.slice(0, 3).join(' | ') : 'spectate: no page errors');

  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 6).join('\n') : 'no page errors');
  await p.screenshot({ path: 'tools/shot-entry.png' });
  await b.close();
})();
