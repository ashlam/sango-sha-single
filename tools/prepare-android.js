/**
 * 准备 Android 打包目录
 *
 * 把 Web 资源复制到 www/（Capacitor 的 webDir），然后可执行：
 *   npm run android:sync   同步到原生工程
 *   npm run android:open   用 Android Studio 打开
 *
 * 依赖：Android Studio + JDK 17 + Android SDK 34
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');

// 需要打包的静态资源
const FILES = ['index.html', 'manifest.json'];
const DIRS = ['css', 'js', 'icons'];

function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copy(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

for (const f of FILES) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(www, f));
}
for (const d of DIRS) {
  const p = path.join(root, d);
  if (fs.existsSync(p)) copy(p, path.join(www, d));
}

let total = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else total += fs.statSync(p).size;
  }
})(www);

console.log(`✓ www/ 已就绪（${(total / 1024).toFixed(1)} KB）`);
console.log('接下来执行： npx cap sync android');
