/* 视觉抽查：横幅（多目标 / 转化 / 长名字）、战报词条、详情抽屉 */
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h, tag] of [[360, 780, 'sm'], [390, 844, 'md'], [768, 1024, 'desk']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.goto('http://127.0.0.1:8000/?fast=1&t=' + Date.now(), { waitUntil: 'networkidle' });
    await p.click('#btnStart');
    await p.waitForSelector('.hero', { timeout: 5000 });
    await p.click('.hero .h-name');
    await p.waitForSelector('.seat .gcard', { timeout: 5000 });
    await p.evaluate(() => { G.beat = async () => {}; G.responder = () => new Promise(() => {}); });
    await p.waitForTimeout(300);

    // 双目标 + 转化牌
    await p.evaluate(() => {
      G.players[1].name = '诸葛亮';
      G.players[2].name = '黄月英';
      showPlayBanner({
        player: G.players[1],
        card: { id: 'shan', suit: 'd', num: 2, uid: 91001, name: '闪' },
        asId: 'sha',
        targets: [G.players[0], G.players[2]],
      });
    });
    await p.waitForTimeout(200);
    const m = await p.evaluate(() => {
      const el = document.getElementById('banner');
      const r = el.getBoundingClientRect();
      const row = el.querySelector('.bn-row').getBoundingClientRect();
      return { w: Math.round(r.width), rowW: Math.round(row.width), vw: innerWidth, overflow: row.width > r.width + 1 };
    });
    console.log(tag, 'banner', JSON.stringify(m));
    await p.screenshot({ path: `tools/e-banner-${tag}.png` });

    // 战报
    await p.evaluate(() => {
      openLog();
      log('诸葛亮 使用 ♥5·杀', 'use');
      log('　目标：黄月英、你', 'dim');
      log('诸葛亮 装备 ♠7·青釭剑', 'equip');
      log('黄月英 发动【集智】摸一张牌', 'skill');
      log('你 受到 1 点伤害（来自 诸葛亮）', 'dmg');
      log('孙尚香 判定：♦9·桃', 'judge');
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `tools/e-log-${tag}.png` });

    // 详情抽屉：视为
    await p.evaluate(() => {
      closeLog();
      openCardSheet({ id: 'shan', suit: 'd', num: 2, uid: 91001, name: '闪' }, { noStatus: true, asId: 'sha' });
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `tools/e-sheet-${tag}.png` });
    await p.close();
  }
  await b.close();
})();
