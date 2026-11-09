const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  await p.goto('http://localhost:8000/?auto=1', { waitUntil: 'networkidle' });

  // 等 AI 回合的横幅（不用 fast，不用接管，让 AI 自然运行）
  let seen = { turn: 0, phase: 0, card: 0, dmg: 0 };
  for (let i = 0; i < 240; i++) {
    const st = await p.evaluate(() => {
      const el = document.getElementById('banner');
      const visible = el && !el.classList.contains('hidden');
      return { visible, txt: visible ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '' };
    });
    if (st.visible) {
      if (st.txt.includes('回合')) seen.turn++;
      else if (st.txt.includes('阶段')) seen.phase++;
      else if (st.txt.includes('伤害')) seen.dmg++;
      else seen.card++;
      if (!seen._shot) { await p.screenshot({ path: 'tools/b1.png' }); seen._shot = 1; }
      else if (seen.card === 1 && !seen._shot2) { await p.screenshot({ path: 'tools/b2.png' }); seen._shot2 = 1; }
    }
    if (i === 120) await p.screenshot({ path: 'tools/b3.png' });
    await p.waitForTimeout(200);
  }
  console.log('横幅统计:', JSON.stringify(seen));
  console.log('ERRORS:', errors.length ? errors.slice(0,5) : 'none');
  await b.close();
})();
