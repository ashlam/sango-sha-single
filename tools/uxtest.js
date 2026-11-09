const { chromium } = require('playwright-core');

async function boot(b, w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#btnStart');
  try {
    await p.waitForSelector('.hero', { timeout: 4000 });
    await p.click('.hero .h-name');
    await p.waitForSelector('.seat .gcard', { timeout: 4000 });
  } catch (e) {
    console.log('BOOT FAIL', errs.slice(0, 3), await p.evaluate(() => ({
      players: G.players.length, seats: document.querySelectorAll('.seat').length,
      gameHidden: document.getElementById('gameScreen').classList.contains('hidden'),
      modal: document.getElementById('modal').className,
      hero: !!document.querySelector('.hero'),
    })));
    throw e;
  }
  await p.waitForTimeout(400);
  return { p, errs };
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });

  /* ---------- 1. 非模态提示卡 ---------- */
  {
    const { p, errs } = await boot(b, 390, 844);
    // 造一个 yesno 请求
    await p.evaluate(() => { window.__res = null; UI.prompt(G.players[0], { kind: 'yesno', prompt: '是否发动【流离】转移此【杀】？', skill: 'liuli' }).then(r => { window.__res = r; }); });
    await p.waitForTimeout(250);

    const st = await p.evaluate(() => {
      const m = document.getElementById('modal');
      const box = document.getElementById('modalBox').getBoundingClientRect();
      const cs = getComputedStyle(m);
      // 提示卡中心点是否命中卡本身
      const seat = document.querySelector('.seat');
      const sr = seat.getBoundingClientRect();
      const hitSeat = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
      const hand = document.querySelector('#handArea .card');
      const hr = hand.getBoundingClientRect();
      const hitHand = document.elementFromPoint(hr.left + hr.width / 2, hr.top + hr.height / 2);
      const selfArea = document.getElementById('selfArea').getBoundingClientRect();
      return {
        cls: m.className,
        bg: cs.backgroundColor, pe: cs.pointerEvents,
        boxBottomGap: Math.round(innerHeight - box.bottom),
        boxW: Math.round(box.width), boxH: Math.round(box.height),
        selfH: Math.round(selfArea.height),
        seatHit: hitSeat ? hitSeat.className.split(' ')[0] : null,
        handHit: hitHand ? hitHand.className.split(' ')[0] : null,
        chip: !document.getElementById('promptChip').classList.contains('hidden'),
      };
    });
    console.log('提示卡:', JSON.stringify(st), 'errs', errs.slice(0, 2));
    await p.screenshot({ path: 'tools/shot-prompt.png' });

    // 收起
    await p.click('#pMini');
    await p.waitForTimeout(200);
    const mini = await p.evaluate(() => ({
      cls: document.getElementById('modal').className,
      chip: !document.getElementById('promptChip').classList.contains('hidden'),
      chipTxt: document.querySelector('#promptChip .pc-txt').textContent,
    }));
    console.log('收起后:', JSON.stringify(mini));
    await p.screenshot({ path: 'tools/shot-prompt-mini.png' });

    // 展开
    await p.click('#promptChip');
    await p.waitForTimeout(200);
    console.log('展开后:', await p.evaluate(() => document.getElementById('modal').className));

    // 应答
    await p.click('#mYes');
    await p.waitForTimeout(200);
    console.log('应答:', await p.evaluate(() => JSON.stringify(window.__res) + ' modal=' + document.getElementById('modal').className));

    /* ---------- 2. 战报不自动滚动 ---------- */
    await p.evaluate(() => { for (let i = 0; i < 40; i++) log('测试战报第 ' + i + ' 行', ''); });
    await p.click('#btnLog');
    await p.waitForTimeout(300);
    const list = await p.$('#logList');
    await p.evaluate(() => { const l = document.getElementById('logList'); l.scrollTop = 120; });
    await p.waitForTimeout(200);
    const before = await p.evaluate(() => document.getElementById('logList').scrollTop);
    await p.evaluate(() => { for (let i = 0; i < 12; i++) log('新消息 ' + i, ''); });
    await p.waitForTimeout(200);
    const after = await p.evaluate(() => ({
      top: document.getElementById('logList').scrollTop,
      badge: !document.getElementById('logNew').classList.contains('hidden'),
      badgeTxt: document.getElementById('logNew').textContent,
    }));
    console.log(`战报: 滚动前 ${before} → 新消息后 ${after.top} badge=${after.badge} "${after.badgeTxt}"`);
    // 点跳转
    await p.click('#logNew');
    await p.waitForTimeout(200);
    console.log('跳到底部:', await p.evaluate(() => {
      const l = document.getElementById('logList');
      return Math.round(l.scrollHeight - l.scrollTop - l.clientHeight) + 'px 距底, badge=' + !document.getElementById('logNew').classList.contains('hidden');
    }));

    /* ---------- 3. 战报打开时弹提示 → 收进底栏 ---------- */
    await p.evaluate(() => { UI.prompt(G.players[0], { kind: 'yesno', prompt: '是否发动【刚烈】？', skill: 'ganglie' }); });
    await p.waitForTimeout(300);
    const withLog = await p.evaluate(() => ({
      lp: !document.getElementById('logPending').classList.contains('hidden'),
      lpTxt: document.querySelector('#logPending .lp-txt').textContent,
      chip: !document.getElementById('promptChip').classList.contains('hidden'),
      modalMini: document.getElementById('modal').classList.contains('mini'),
    }));
    console.log('战报中弹提示:', JSON.stringify(withLog));
    await p.screenshot({ path: 'tools/shot-log-pending.png' });

    // 点底栏处理
    await p.click('#logPending');
    await p.waitForTimeout(300);
    console.log('点处理后:', await p.evaluate(() => ({
      log: !document.getElementById('logPanel').classList.contains('hidden'),
      modal: document.getElementById('modal').className,
      chip: !document.getElementById('promptChip').classList.contains('hidden'),
    })), 'errs', errs.slice(0, 3));
    await p.close();
  }

  /* ---------- 4. 桌面尺寸 ---------- */
  {
    const { p, errs } = await boot(b, 1280, 800);
    await p.evaluate(() => { UI.prompt(G.players[0], { kind: 'yesno', prompt: '是否发动【流离】转移此【杀】？', skill: 'liuli' }); });
    await p.waitForTimeout(250);
    await p.click('#pMini');
    await p.waitForTimeout(150);
    await p.screenshot({ path: 'tools/shot-prompt-desk.png' });
    console.log('桌面 errs', errs.slice(0, 2));
    await p.close();
  }

  /* ---------- 5. 竖屏横屏截图 ---------- */
  {
    const { p, errs } = await boot(b, 844, 390);
    // 同步测量，避免被引擎的其它请求覆盖
    const box = await p.evaluate(() => {
      UI.prompt(G.players[0], { kind: 'yesno', prompt: '是否发动【流离】转移此【杀】？', skill: 'liuli' });
      const r = document.getElementById('modalBox').getBoundingClientRect();
      return [Math.round(r.top), Math.round(r.bottom), Math.round(r.height), innerHeight, document.getElementById('modal').className];
    });
    await p.waitForTimeout(200);
    await p.screenshot({ path: 'tools/shot-prompt-land.png' });
    console.log('横屏 卡框 top/bottom/h/innerH/class:', box.join(' / '), 'errs', errs.slice(0, 2));
    await p.close();
  }

  await b.close();
})();
