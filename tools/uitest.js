const { chromium } = require('playwright-core');

async function longPress(page, sel, idx) {
  const els = await page.$$(sel);
  if (!els[idx]) return false;
  const b = await els[idx].boundingBox();
  if (!b) return false;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(620);
  await page.mouse.up();
  await page.waitForTimeout(320);
  return true;
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await p.goto('http://localhost:8000/?fast=1', { waitUntil: 'networkidle' });
  await p.click('#btnStart'); await p.waitForTimeout(300);
  await p.click('.hero:nth-child(1) .h-name'); await p.waitForTimeout(300);
  await p.evaluate(() => {
    setInterval(() => {
      if (!UI.req || UI.req.kind === 'play') return;
      const pl = UI.player, r = UI.req, fn = UI.resolve;
      Promise.resolve(AI.decide(pl, r)).then(res => {
        UI.req = null; UI.player = null; UI.resolve = null;
        document.getElementById('modal').classList.add('hidden');
        if (fn) fn(res);
      });
    }, 80);
  });
  for (let i = 0; i < 200; i++) {
    if (await p.evaluate(() => UI.req && UI.req.kind === 'play')) break;
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(300);

  console.log('=== 1. 长按手牌 ===');
  const ok = await longPress(p, '#handArea .card', 0);
  console.log('长按触发:', ok, '抽屉打开:', await p.evaluate(() => !document.getElementById('sheet').classList.contains('hidden')));
  console.log('标题:', await p.evaluate(() => (document.querySelector('.sheet-title')||{}).textContent));
  console.log('含「牌面效果」:', await p.evaluate(() => document.getElementById('sheetBody').textContent.includes('牌 面 效 果')));
  console.log('关键词 chip 数:', await p.evaluate(() => document.querySelectorAll('#sheetBody .kw').length));
  await p.screenshot({ path: 'tools/ui-card.png' });

  console.log('=== 2. 点关键词联查 ===');
  const kw = await p.$('#sheetBody .kw');
  if (kw) { await kw.click(); await p.waitForTimeout(300); console.log('联查后标题:', await p.evaluate(() => (document.querySelector('.sheet-title')||{}).textContent)); }
  await p.click('#sheetClose'); await p.waitForTimeout(300);

  console.log('=== 3. 长按对手武将卡 ===');
  await longPress(p, '.seat', 0);
  console.log('标题:', await p.evaluate(() => (document.querySelector('.sheet-title')||{}).textContent));
  console.log('技能行数:', await p.evaluate(() => document.querySelectorAll('#sheetBody .sk-row').length));
  console.log('技能描述长度:', await p.evaluate(() => { const d = document.querySelector('#sheetBody .sk-desc'); return d ? d.textContent.length : 0; }));
  await p.screenshot({ path: 'tools/ui-general.png' });

  console.log('=== 4. 点技能行看技能详情 ===');
  const sk = await p.$('#sheetBody .sk-row');
  if (sk) { await sk.click(); await p.waitForTimeout(300); console.log('技能标题:', await p.evaluate(() => (document.querySelector('.sheet-title')||{}).textContent)); console.log('返回键可见:', await p.evaluate(() => { const b=document.getElementById('sheetBack'); return b && getComputedStyle(b).visibility; })); }
  await p.click('#sheetClose'); await p.waitForTimeout(300);

  console.log('=== 5. 图鉴 ===');
  await p.click('#btnCodex'); await p.waitForTimeout(400);
  console.log('标题:', await p.evaluate(() => (document.querySelector('.sheet-title')||{}).textContent));
  console.log('标签页:', await p.evaluate(() => [...document.querySelectorAll('.cx-tab')].map(t=>t.textContent)));
  console.log('卡牌条目数:', await p.evaluate(() => document.querySelectorAll('#codexBody .cx-row').length));
  await p.screenshot({ path: 'tools/ui-codex.png' });
  await p.click('.cx-tab[data-cx="skills"]'); await p.waitForTimeout(300);
  console.log('技能条目数:', await p.evaluate(() => document.querySelectorAll('#codexBody .cx-row').length));
  await p.click('.cx-tab[data-cx="rules"]'); await p.waitForTimeout(300);
  console.log('规则区块数:', await p.evaluate(() => document.querySelectorAll('#codexBody .rule-sec').length));
  await p.screenshot({ path: 'tools/ui-rules.png' });
  await p.click('#sheetClose'); await p.waitForTimeout(300);

  console.log('=== 6. 选牌后的距离徽章 ===');
  const idx = await p.evaluate(() => G.players[0].hand.findIndex(c => ['sha','huosha','leisha'].includes(c.id)));
  if (idx >= 0) {
    await p.evaluate(i => document.querySelectorAll('#handArea .card')[i].click(), idx);
    await p.waitForTimeout(350);
    console.log('距离徽章:', await p.evaluate(() => [...document.querySelectorAll('.seat .dist-tag')].filter(d=>d.style.display!=='none').map(d=>d.textContent)));
    await p.screenshot({ path: 'tools/ui-dist.png' });
  } else { console.log('本回合无杀，改测任意牌'); }

  console.log('=== 7. 操作提示条 ⓘ ===');
  await p.click('#btnPromptInfo'); await p.waitForTimeout(350);
  console.log('抽屉标题:', await p.evaluate(() => (document.querySelector('.sheet-title')||{}).textContent));
  console.log('待办横幅:', await p.evaluate(() => { const e=document.getElementById('sheetPending'); return e ? !e.classList.contains('hidden') : null; }));
  await p.screenshot({ path: 'tools/ui-promptinfo.png' });
  await p.click('#sheetClose'); await p.waitForTimeout(200);

  console.log('=== 8. 引导气泡 ===');
  console.log('coach 可见:', await p.evaluate(() => !document.getElementById('coach').classList.contains('hidden')));
  console.log('coach 文本:', await p.evaluate(() => (document.querySelector('.coach-txt')||{}).textContent));

  console.log('ERRORS:', errors.length ? errors.slice(0,6) : 'none');
  await b.close();
})();
