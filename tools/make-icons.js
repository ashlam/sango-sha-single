/**
 * 生成安卓启动图标（含 adaptive icon 前景）与启动图
 * 用法：node tools/make-icons.js
 * 依赖 playwright-core + 本机 Chrome（不下载额外浏览器）
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const DENS = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

/* 方形图标：深褐底 + 金线 + 朱红「殺」印 */
function iconHTML(size, round) {
  const s = size;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${s}px;height:${s}px;background:transparent;overflow:hidden}
    .wrap{width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center;
      border-radius:${round ? '50%' : Math.round(s * 0.22) + 'px'};
      background:radial-gradient(ellipse at 50% 22%, #2a2118 0%, #16110d 58%, #0c0a08 100%);
      box-shadow:inset 0 0 0 ${Math.max(1, Math.round(s * 0.012))}px rgba(200,169,92,.55);}
    .seal{width:${Math.round(s * 0.62)}px;height:${Math.round(s * 0.62)}px;
      display:flex;align-items:center;justify-content:center;
      border:${Math.max(2, Math.round(s * 0.035))}px solid #b23a2e;border-radius:${Math.round(s * 0.08)}px;
      color:#c8453a;font-family:"KaiTi","STKaiti","SimSun",serif;
      font-size:${Math.round(s * 0.44)}px;line-height:1;
      box-shadow:0 0 ${Math.round(s * 0.16)}px rgba(178,58,46,.45), inset 0 0 ${Math.round(s * 0.1)}px rgba(178,58,46,.2);
      transform:rotate(-3deg);}
  </style></head><body><div class="wrap"><div class="seal">殺</div></div></body></html>`;
}

/* adaptive icon 前景：透明画布，印章居中且落在 66% 安全区里 */
function fgHTML(size) {
  const s = size;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${s}px;height:${s}px;background:transparent;overflow:hidden}
    .wrap{width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center}
    .seal{width:${Math.round(s * 0.42)}px;height:${Math.round(s * 0.42)}px;
      display:flex;align-items:center;justify-content:center;
      border:${Math.max(2, Math.round(s * 0.024))}px solid #b23a2e;border-radius:${Math.round(s * 0.055)}px;
      color:#c8453a;font-family:"KaiTi","STKaiti","SimSun",serif;
      font-size:${Math.round(s * 0.3)}px;line-height:1;
      box-shadow:0 0 ${Math.round(s * 0.1)}px rgba(178,58,46,.5);
      transform:rotate(-3deg);}
  </style></head><body><div class="wrap"><div class="seal">殺</div></div></body></html>`;
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const page = await b.newPage({ deviceScaleFactor: 1 });

  async function render(html, size, out, transparent) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(40);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, omitBackground: !!transparent, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('  ✓', path.relative(path.join(__dirname, '..'), out));
  }

  for (const [name, k] of DENS) {
    const base = 48 * k;
    await render(iconHTML(base, false), base, path.join(RES, `mipmap-${name}`, 'ic_launcher.png'));
    await render(iconHTML(base, true), base, path.join(RES, `mipmap-${name}`, 'ic_launcher_round.png'));
    const fg = Math.round(108 * k);
    await render(fgHTML(fg), fg, path.join(RES, `mipmap-${name}`, 'ic_launcher_foreground.png'), true);
  }

  await b.close();
  console.log('图标已生成');
})();
