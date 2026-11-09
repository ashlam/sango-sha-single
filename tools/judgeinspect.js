'use strict';
/* 浏览器回归：
 *  1) 判定区的延时锦囊「点一下」就能看效果（对手角标 + 自己判定行）
 *  2) 战报里能看到具体弃掉的牌，而且牌名可以点开详情
 * 不启动 gameLoop，直接搭一局静态盘面，避免 AI 把判定牌结算掉。 */
const { chromium } = require('playwright-core');

let pass = 0, fail = 0;
const OK = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];

  for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 640 }]) {
    const p = await b.newPage({ viewport: vp, deviceScaleFactor: 2 });
    p.on('pageerror', e => errs.push(vp.width + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(vp.width + ': ' + m.text()); });
    await p.goto('http://127.0.0.1:8000/?t=' + Date.now(), { waitUntil: 'networkidle' });

    const state = await p.evaluate(() => {
      newGame({ playerCount: 4 });
      G.players.forEach((pl, i) => assignGeneral(pl, GENERALS[i]));
      const lord = G.players.find(x => x.identity === 'lord');
      if (lord) { lord.maxHp += 1; lord.hp = lord.maxHp; }
      buildDeck();
      document.getElementById('startScreen').classList.add('hidden');
      document.getElementById('gameScreen').classList.remove('hidden');
      document.getElementById('seats').innerHTML = '';
      UI.seatEls = {};
      G.current = 0;
      // 自己挂【乐不思蜀】，1 号对手挂【闪电】
      G.players[0].judgeZone.push({ uid: 990001, id: 'lebu', suit: 's', num: 6, name: '乐不思蜀' });
      G.players[1].judgeZone.push({ uid: 990002, id: 'shandian', suit: 'h', num: 12, name: '闪电' });
      UI.render();
      return { me: G.players[0].general, foe: G.players[1].general };
    });
    console.log(`\n── ${vp.width}×${vp.height} ──`);

    const jr = await p.evaluate(() => {
      const el = document.querySelector('#selfJudge .judge-row');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const hand = document.querySelector('#handArea .card');
      const hr = hand ? hand.getBoundingClientRect() : null;
      return {
        txt: el.textContent,
        pe: getComputedStyle(el).pointerEvents,
        hittable: !!hit && (el === hit || el.contains(hit)),
        h: Math.round(r.height),
        overlapsHand: hr ? !(r.bottom <= hr.top || r.top >= hr.bottom) : false,
        overflow: document.getElementById('selfArea').scrollWidth - document.getElementById('selfArea').clientWidth,
      };
    });
    OK(!!jr && jr.txt.includes('判定区 · 乐不思蜀'), '自己的判定牌有可见文字说明');
    OK(!!jr && jr.pe === 'auto', '判定行可接收点击（pointer-events:auto）');
    OK(!!jr && jr.hittable, '判定行没有被别的东西盖住');
    OK(!!jr && jr.h >= 17, `判定行有可点的高度（${jr && jr.h}px）`);
    OK(!!jr && !jr.overlapsHand, '判定行不再压在手牌上');
    OK(!!jr && jr.overflow <= 2, `底部区域无横向溢出（${jr && jr.overflow}px）`);

    // 对手判定角标：点按直接开抽屉
    await p.click('.seat .jtag');
    await p.waitForTimeout(120);
    let sheet = await p.evaluate(() => ({
      open: !document.getElementById('sheet').classList.contains('hidden'),
      txt: document.getElementById('sheetPanel').innerText,
    }));
    OK(sheet.open && sheet.txt.includes('闪电'), '点对手判定角标 → 打开【闪电】详情');
    OK(sheet.txt.includes('牌 面 效 果'), '详情里有「牌面效果」正文');
    OK(sheet.txt.includes('判定区 ·') && sheet.txt.includes('回合开始时判定'), '详情说明了判定区状态与结算时机');

    // 关掉抽屉，点自己的判定行
    await p.evaluate(() => document.getElementById('sheetScrim').click());
    await p.click('#selfJudge .judge-row');
    await p.waitForTimeout(120);
    sheet = await p.evaluate(() => ({
      open: !document.getElementById('sheet').classList.contains('hidden'),
      txt: document.getElementById('sheetPanel').innerText,
    }));
    OK(sheet.open && sheet.txt.includes('乐不思蜀'), '点自己的判定行 → 打开【乐不思蜀】详情');
    OK(sheet.txt.includes('判定区 ·'), '自己的判定牌也带判定区说明');

    // 长按仍然有效（点按不能把长按弄坏）
    await p.evaluate(() => document.getElementById('sheetScrim').click());
    const box = await p.$('.seat .jtag');
    const bb = await box.boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(450);
    await p.mouse.up();
    await p.waitForTimeout(120);
    const longOpen = await p.evaluate(() => !document.getElementById('sheet').classList.contains('hidden'));
    OK(longOpen, '长按 380ms 依然能检视（原有手势未破坏）');
    await p.evaluate(() => document.getElementById('sheetScrim').click());

    // 装备槽 / 自己武将卡：同样点一下就开
    await p.click('.eq-slot');
    await p.waitForTimeout(100);
    const eq = await p.evaluate(() => document.getElementById('sheetPanel').innerText);
    OK(eq.includes('武器区'), '点装备槽 → 打开装备区详情');
    await p.evaluate(() => document.getElementById('sheetScrim').click());
    await p.click('#selfGeneral');
    await p.waitForTimeout(100);
    const gen = await p.evaluate(() => document.getElementById('sheetPanel').innerText);
    OK(gen.includes(state.me) && gen.includes('判 定 区'), '点自己的武将卡 → 武将详情含判定区列表');
    await p.evaluate(() => document.getElementById('sheetScrim').click());

    // 战报：弃牌要列出具体牌名，且牌名可点开详情
    const disc = await p.evaluate(() => {
      // 静态盘面没有发牌，自己塞一张已知花色的牌进来
      const c = { uid: 999123, id: 'sha', suit: 's', num: 7, name: '杀' };
      G.players[0].hand.push(c);
      const before = G.log.length;
      discardCards(G.players[0], [c]);
      return {
        id: c.id,
        text: G.log.slice(before).map(x => x.text).join(' | '),
        html: document.querySelector('#logList .lg:last-child').innerHTML,
      };
    });
    OK(/\p{Sc}?[♠♥♣♦](?:\d{1,2}|[AJQK])·/.test(disc.text) || /[♠♥♣♦]/.test(disc.text),
      `战报写出了具体弃牌（${disc.text}）`);
    OK(disc.html.includes('lg-kw') && disc.html.includes(`data-id="${disc.id}"`), '弃掉的牌名被做成可点词条');

    await p.click('#btnLog');
    await p.waitForTimeout(100);
    await p.click('#logList .lg:last-child .lg-kw');
    await p.waitForTimeout(120);
    const cardSheet = await p.evaluate(() => ({
      open: !document.getElementById('sheet').classList.contains('hidden'),
      txt: document.getElementById('sheetPanel').innerText,
    }));
    OK(cardSheet.open && cardSheet.txt.includes('牌 面 效 果'), '点战报里的弃牌牌名 → 打开卡牌详情');

    await p.close();
  }

  OK(errs.length === 0, `无页面报错（${errs.slice(0, 3).join(' | ') || 'none'}）`);
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await b.close();
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
