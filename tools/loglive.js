/* 真实对局里：打开战报往上翻，看 AI 继续行动时阅读位置是否被顶走 */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8000/?auto=1&fast=1&players=8&t=' + Date.now(), { waitUntil: 'networkidle' });
  await p.waitForSelector('.seat .gcard');
  // 等战报里攒够内容
  for (let i = 0; i < 60; i++) {
    if (await p.evaluate(() => document.querySelectorAll('#logList .lg').length >= 45)) break;
    await p.waitForTimeout(150);
  }
  await p.click('#btnLog');
  await p.waitForTimeout(200);
  await p.evaluate(() => { document.getElementById('logList').scrollTop = 70; });
  await p.waitForTimeout(200);
  const before = await p.evaluate(() => ({
    top: document.getElementById('logList').scrollTop,
    at: document.querySelector('#logList').children[3].textContent,
    n: G.log.length,
  }));
  await p.waitForTimeout(2500);
  const after = await p.evaluate(() => ({
    top: document.getElementById('logList').scrollTop,
    at: document.querySelector('#logList').children[3].textContent,
    n: G.log.length,
    badge: !document.getElementById('logNew').classList.contains('hidden'),
    badgeTxt: document.getElementById('logNew').textContent,
    coachHidden: getComputedStyle(document.getElementById('coach')).display === 'none',
    modalOpen: !document.getElementById('modal').classList.contains('hidden'),
  }));
  console.log('阅读位置: 前', before.top, '→ 后', after.top, '| 第4行没变:', before.at === after.at);
  console.log('日志', before.n, '→', after.n, '条，badge=', after.badge, `"${after.badgeTxt}"`, 'coach隐藏=', after.coachHidden, '结算弹窗=', after.modalOpen);
  await p.screenshot({ path: 'tools/shot-log-live.png' });
  if (after.badge && !after.modalOpen) {
    await p.click('#logNew');
    await p.waitForTimeout(250);
    console.log('点跳转后距底:', await p.evaluate(() => {
      const l = document.getElementById('logList');
      return Math.round(l.scrollHeight - l.scrollTop - l.clientHeight) + 'px';
    }));
  }
  console.log('errs', errs.slice(0, 3));
  await b.close();
})();
