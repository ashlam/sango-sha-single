/* 回归：长按装备槽应显示已装备牌的详情（曾因 +arg 把槽位名转成 NaN → 永远「空」） */
const { chromium } = require('playwright-core');
const OK = (c, m) => console.log((c ? '  ok   ' : '  FAIL ') + m);

async function hold(page, sel) {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(520);
  await page.mouse.up();
  await page.waitForTimeout(260);
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://127.0.0.1:8000/?fast=1&players=4&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.click('#btnStart');
  await p.waitForSelector('.hero', { timeout: 5000 });
  await p.click('.hero .h-name');
  await p.waitForSelector('.seat .gcard', { timeout: 5000 });
  await p.waitForTimeout(400);

  await p.evaluate(() => {
    G.over = true;
    G.beat = async () => {};
    const me = G.players[0];
    me.equip.weapon = makeCard({ id: 'zhuge', suit: 'c', num: 1 });
    me.equip.armor = makeCard({ id: 'bagua', suit: 's', num: 2 });
    me.equip.horsePlus = makeCard({ id: 'chitu', suit: 'h', num: 5 });
    UI.render();
  });
  await p.waitForTimeout(200);

  /* 1. 武器槽 */
  await hold(p, '#selfEquip .eq-slot:nth-child(1)');
  let st = await p.evaluate(() => ({
    open: !document.getElementById('sheet').classList.contains('hidden'),
    title: (document.querySelector('.sheet-title') || {}).textContent,
    text: document.getElementById('sheetBody').textContent,
  }));
  OK(st.open, '长按武器槽打开详情');
  OK(/诸葛连弩/.test(st.title || ''), `标题是牌名（${st.title}）`);
  OK(/攻击范围/.test(st.text), '正文有装备效果说明');
  await p.click('#sheetClose');
  await p.waitForTimeout(200);

  /* 2. 防具槽 */
  await hold(p, '#selfEquip .eq-slot:nth-child(2)');
  st = await p.evaluate(() => ({
    title: (document.querySelector('.sheet-title') || {}).textContent,
    text: document.getElementById('sheetBody').textContent,
  }));
  OK(/八卦阵/.test(st.title || ''), `防具槽显示八卦阵（${st.title}）`);
  await p.click('#sheetClose');
  await p.waitForTimeout(200);

  /* 3. 空槽仍提示为空 */
  await hold(p, '#selfEquip .eq-slot:nth-child(4)');
  st = await p.evaluate(() => ({
    title: (document.querySelector('.sheet-title') || {}).textContent,
    text: document.getElementById('sheetBody').textContent,
  }));
  OK(/坐骑区/.test(st.title || '') && /当前为空/.test(st.text), `空槽提示为空（${st.title} / ${st.text.trim()}）`);

  console.log(errs.length ? 'ERR ' + errs.join(' | ') : '  无报错');
  await b.close();
})();
