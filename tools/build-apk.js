/**
 * 一键出 APK：www 打包 → cap sync → gradle assembleRelease → zipalign → 签名
 *
 * 用法：node tools/build-apk.js
 * 产物：dist/三国杀-<versionName>.apk
 *
 * 依赖：JDK 17+（优先用 Android Studio 自带的 jbr）、Android SDK、本地 keystore。
 * keystore 与密码可用环境变量覆盖：
 *   SGS_KEYSTORE / SGS_KEY_ALIAS / SGS_KEY_PASS
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const android = path.join(root, 'android');
const dist = path.join(root, 'dist');

const WIN = process.platform === 'win32';

function run(cmd, args, opts) {
  // Node 20+ 禁止直接 spawn .cmd / .bat（CVE-2024-27980，会抛 EINVAL），
  // 必须过一层 cmd.exe；参数自己加引号，否则路径带空格就断
  if (WIN && /\.(cmd|bat)$/i.test(cmd)) {
    const q = s => (/[\s"&|<>^]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
    return execFileSync(process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', [cmd, ...args.map(q)].join(' ')],
      { encoding: 'utf8', stdio: 'pipe', ...opts });
  }
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
}
function log(msg) { console.log(msg); }

/* ---------- 1. 找 JDK ---------- */
function findJavaHome() {
  const cands = [
    process.env.SGS_JAVA_HOME,
    process.env.JAVA_HOME,
    'D:/Program Files/Android/Android Studio/jbr',
    'C:/Program Files/Android/Android Studio/jbr',
    'C:/Program Files/Java/jdk-21',
    'C:/Program Files/Java/jdk-17',
  ].filter(Boolean);
  for (const d of cands) {
    const java = path.join(d, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (fs.existsSync(java)) {
      try {
        const v = run(java, ['-version'], { stdio: 'pipe' });
        return d;
      } catch (e) {
        // java -version 往 stderr 输出，execFileSync 会抛，但说明可执行
        return d;
      }
    }
  }
  throw new Error('找不到 JDK 17+，请设置 SGS_JAVA_HOME 指向 Android Studio 的 jbr');
}

/* ---------- 2. 找 build-tools ---------- */
function findBuildTools() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
    || 'C:/Users/' + (process.env.USERNAME || 'Administrator') + '/AppData/Local/Android/Sdk';
  const dir = path.join(sdk, 'build-tools');
  if (!fs.existsSync(dir)) throw new Error('找不到 Android SDK build-tools：' + dir);
  // 取版本号最大的一个
  const vers = fs.readdirSync(dir)
    .filter(v => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => {
      const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
      return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
    });
  for (const v of vers) {
    const bt = path.join(dir, v);
    if (fs.existsSync(path.join(bt, 'apksigner.bat')) || fs.existsSync(path.join(bt, 'apksigner'))) return bt;
  }
  throw new Error('build-tools 里没有 apksigner');
}

const javaHome = findJavaHome();
const bt = findBuildTools();
const env = { ...process.env, JAVA_HOME: javaHome, PATH: path.join(javaHome, 'bin') + path.delimiter + process.env.PATH };
const win = WIN;

log('▸ JDK: ' + javaHome);
log('▸ build-tools: ' + bt);

/* ---------- 3. 同步 web 资源 ---------- */
log('▸ 打包 www …');
run(process.execPath, [path.join(__dirname, 'prepare-android.js')], { cwd: root });
log('▸ cap sync …');
run(win ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android'], { cwd: root, env, stdio: 'inherit' });

/* ---------- 4. 编译 ---------- */
log('▸ gradle assembleRelease …');
run(win ? 'gradlew.bat' : './gradlew', ['assembleRelease', '--no-daemon', '-q'], { cwd: android, env, stdio: 'inherit' });

const unsigned = path.join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
if (!fs.existsSync(unsigned)) throw new Error('没有生成 APK：' + unsigned);

/* ---------- 5. 对齐 + 签名 ---------- */
const ks = process.env.SGS_KEYSTORE || path.join(android, 'sangosha-release.jks');
const alias = process.env.SGS_KEY_ALIAS || 'sangosha';
const pass = process.env.SGS_KEY_PASS || 'sango2026';
if (!fs.existsSync(ks)) throw new Error('找不到 keystore：' + ks + '（可用 SGS_KEYSTORE 指定）');

const versionName = (fs.readFileSync(path.join(android, 'app', 'build.gradle'), 'utf8')
  .match(/versionName\s+"([^"]+)"/) || [])[1] || '1.0.0';
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, `三国杀-${versionName}.apk`);
const aligned = path.join(dist, '_aligned.apk');

log('▸ zipalign …');
run(path.join(bt, win ? 'zipalign.exe' : 'zipalign'), ['-f', '-p', '4', unsigned, aligned]);

log('▸ 签名 …');
const signer = path.join(bt, win ? 'apksigner.bat' : 'apksigner');
run(signer, ['sign', '--ks', ks, '--ks-key-alias', alias,
  '--ks-pass', 'pass:' + pass, '--key-pass', 'pass:' + pass, '--out', out, aligned], { env });
fs.rmSync(aligned, { force: true });
const idsig = out + '.idsig';
if (fs.existsSync(idsig)) fs.rmSync(idsig, { force: true });

/* ---------- 6. 校验 ----------
 * aapt / apksigner 走 Windows 时会按 ANSI 解码命令行参数，
 * 中文文件名会被拆成乱码（Illegal byte sequence）而读不到文件。
 * 所以先复制一份 ASCII 名字的临时副本再校验。
 */
const probe = path.join(dist, '_verify.apk');
fs.copyFileSync(out, probe);
let info = '', sigOk = false;
try {
  info = run(path.join(bt, win ? 'aapt.exe' : 'aapt'), ['dump', 'badging', probe], { env });
} catch (e) { info = ''; }
try {
  run(path.join(bt, win ? 'apksigner.bat' : 'apksigner'),
    ['verify', '--print-certs', probe], { env });
  sigOk = true;
} catch (e) { sigOk = false; }
fs.rmSync(probe, { force: true });

const line = (info.split(/\r?\n/).find(l => l.startsWith('package:')) || '').trim();
const launcher = (info.split(/\r?\n/).find(l => l.startsWith('launchable-activity:')) || '').trim();
const size = (fs.statSync(out).size / 1048576).toFixed(1);

log('');
log('✓ 已生成 ' + path.relative(root, out) + `（${size} MB）`);
if (line) log('  ' + line);
if (launcher) log('  ' + launcher);
log('  签名校验：' + (sigOk ? '通过' : '⚠ 未通过，请检查 keystore'));
log('  安装：adb install -r "' + out + '"');
