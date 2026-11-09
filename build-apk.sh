#!/usr/bin/env bash
# =============================================================================
# 三国杀 单机版 —— NAS / Linux 一键打包 APK
#
# 用法（在仓库根目录）：
#   ./build-apk.sh               完整流程：npm 安装 → 生成 www → 同步原生 → gradle → 签名
#   ./build-apk.sh --no-install 跳过 npm install（node_modules 已就绪时）
#   ./build-apk.sh --help        看这段说明
#
# 前置依赖（在 NAS 上装好即可，路径用环境变量告诉脚本，脚本也会自动探测）：
#   - Node.js (>=18)                              ← 生成 www / 跑 Capacitor
#   - JDK 17+（AGP 8.7 需要；推荐 21）            ← 编译 Android
#   - Android SDK（build-tools 含 zipalign/apksigner，platform 35）
#   首次 gradle 会下载 Gradle 8.9（约 150MB），需要联网
#
# 环境变量（均可选）：
#   JAVA_HOME / SGS_JAVA_HOME         指向 JDK 根目录
#   ANDROID_HOME / ANDROID_SDK_ROOT   指向 Android SDK 根目录
#   SGS_KEYSTORE   签名密钥库路径（默认 android/sangosha-release.jks）
#   SGS_KEY_ALIAS  密钥别名（默认 sangosha）
#   SGS_KEY_PASS   密钥库/密钥密码（默认 sango2026；没有 keystore 时会用这个自动生成）
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

DO_INSTALL=1
for a in "$@"; do
  case "$a" in
    --no-install) DO_INSTALL=0 ;;
    -h|--help)    sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "未知参数: $a（可用 --no-install / --help）" >&2; exit 1 ;;
  esac
done

echo "============================================================"
echo " 三国杀 单机版 · 打包 APK (Linux/NAS)"
echo "============================================================"
echo " 目录 : $ROOT"
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo " 分支 : $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
  DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
  if [ "$DIRTY" != "0" ]; then
    echo " ⚠ 未提交改动 $DIRTY 个（下面这些也会被打进 APK）："
    git status --porcelain | head -10 | sed 's/^/      /'
  else
    echo " 未提交 : 0 个（干净）"
  fi
fi
echo

die() { echo "✗ $*" >&2; exit 1; }

# ---- 0. 基础命令自检 ----------------------------------------------------------
command -v node >/dev/null 2>&1 || die "找不到 node，请先装好 Node.js (>=18)"
command -v npm  >/dev/null 2>&1 || die "找不到 npm"

# ---- 1. 找 JDK ----------------------------------------------------------------
find_jdk() {
  local cand=()
  [ -n "${SGS_JAVA_HOME:-}" ] && cand+=("$SGS_JAVA_HOME")
  [ -n "${JAVA_HOME:-}" ]     && cand+=("$JAVA_HOME")
  if command -v javac >/dev/null 2>&1; then
    cand+=("$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")")
  fi
  cand+=(/usr/lib/jvm/* /opt/android-studio/jbr /opt/data/android-build/tools/jdk-17 "$HOME/android-studio/jbr")
  for d in "${cand[@]}"; do
    [ -z "$d" ] && continue
    if [ -x "$d/bin/javac" ] || [ -x "$d/bin/java" ]; then echo "$d"; return 0; fi
  done
  return 1
}
JAVA_HOME="$(find_jdk)" || die "找不到 JDK 17+，请设置 JAVA_HOME 或 SGS_JAVA_HOME"
echo "▸ JDK : $JAVA_HOME"

# ---- 2. 找 Android SDK + build-tools ------------------------------------------
find_sdk() {
  local cand=()
  [ -n "${ANDROID_HOME:-}" ]     && cand+=("$ANDROID_HOME")
  [ -n "${ANDROID_SDK_ROOT:-}" ] && cand+=("$ANDROID_SDK_ROOT")
  cand+=(/opt/android-sdk /opt/data/android-build/tools/sdk "$HOME/Android/Sdk" /usr/lib/android-sdk)
  for d in "${cand[@]}"; do
    [ -z "$d" ] && continue
    if [ -d "$d/build-tools" ] || [ -d "$d/platforms" ]; then echo "$d"; return 0; fi
  done
  return 1
}
SDK="$(find_sdk)" || die "找不到 Android SDK，请设置 ANDROID_HOME 或 ANDROID_SDK_ROOT"
echo "▸ SDK : $SDK"

find_bt() {
  local dir="$1/build-tools"; [ -d "$dir" ] || return 1
  local best="" bestv=""
  for v in "$dir"/*; do
    [ -x "$v/zipalign" ] && [ -x "$v/apksigner" ] || continue
    local ver="${v##*/}"
    if [ -z "$best" ] || [ "$(printf '%s\n%s\n' "$ver" "$bestv" | sort -V | tail -1)" = "$ver" ]; then
      best="$v"; bestv="$ver"
    fi
  done
  [ -n "$best" ] && { echo "$best"; return 0; }
  return 1
}
BT="$(find_bt "$SDK")" || die "build-tools 里没有 zipalign / apksigner（请装 build-tools）"
echo "▸ build-tools : $BT"

# 导出给 gradle / cap 用
export JAVA_HOME ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
export PATH="$JAVA_HOME/bin:$BT:$SDK/platform-tools:$PATH"

# gradle 靠 local.properties 里的 sdk.dir；仓库里这个文件是 gitignore 的，
# 新 clone 下来不存在，所以这里补一个（不进版本库，安全）
if [ ! -f android/local.properties ]; then
  echo "sdk.dir=$SDK" > android/local.properties
  echo "▸ 已写入 android/local.properties (sdk.dir=$SDK)"
fi
chmod +x android/gradlew 2>/dev/null || true

# ---- 3. 安装依赖（含 Capacitor CLI）------------------------------------------
if [ "$DO_INSTALL" = "1" ]; then
  if [ ! -x node_modules/.bin/cap ] && [ ! -d node_modules ]; then
    echo "▸ npm install …"
    npm install --no-audit --no-fund
  else
    echo "▸ node_modules 已存在，跳过 npm install（加 --no-install 可强制跳过）"
  fi
fi

# ---- 4. 生成 web 资源 (www/) --------------------------------------------------
echo "▸ 生成 www/ …"
node tools/prepare-android.js

# ---- 5. 同步到原生工程（优先 cap，否则手动复制）-------------------------------
ASSETS="android/app/src/main/assets/public"
if [ -x node_modules/.bin/cap ]; then
  echo "▸ cap sync android …"
  node_modules/.bin/cap sync android
else
  echo "▸ 未找到 Capacitor CLI，改用「手动复制 www → android assets」"
  rm -rf "$ASSETS"; mkdir -p "$ASSETS"
  cp -r www/. "$ASSETS/"
fi

# ---- 6. 编译 release ----------------------------------------------------------
echo "▸ gradle assembleRelease …"
( cd android && ./gradlew assembleRelease --no-daemon )
UNSIGNED="android/app/build/outputs/apk/release/app-release-unsigned.apk"
[ -f "$UNSIGNED" ] || die "编译未产出 $UNSIGNED"

# ---- 7. 密钥库（没有就自动生成一个，务必备份！）------------------------------
KS="${SGS_KEYSTORE:-$ROOT/android/sangosha-release.jks}"
ALIAS="${SGS_KEY_ALIAS:-sangosha}"
PASS="${SGS_KEY_PASS:-sango2026}"
if [ ! -f "$KS" ]; then
  echo "⚠ 未找到 keystore：$KS"
  echo "  将用默认参数自动生成（请务必备份此文件，否则换机器后无法覆盖安装旧包！）"
  "$JAVA_HOME/bin/keytool" -genkeypair -v \
    -keystore "$KS" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=Sango Sha, OU=Game, O=SangoSha, L=Shanghai, ST=Shanghai, C=CN"
fi

# ---- 8. 对齐 + 签名 -----------------------------------------------------------
VERSION_NAME="$(grep -m1 'versionName' android/app/build.gradle 2>/dev/null | sed -E 's/.*"([^"]+)".*/\1/')" || true
VERSION_NAME="${VERSION_NAME:-1.0.0}"
mkdir -p dist
OUT="dist/三国杀-${VERSION_NAME}.apk"
ALIGNED="dist/_aligned.apk"

echo "▸ zipalign …"
"$BT/zipalign" -f -p 4 "$UNSIGNED" "$ALIGNED"
echo "▸ 签名 …"
"$BT/apksigner" sign --ks "$KS" --ks-key-alias "$ALIAS" \
  --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
  --out "$OUT" "$ALIGNED"
rm -f "$ALIGNED"

# ---- 9. 校验 + 汇报 -----------------------------------------------------------
echo "▸ 校验签名 …"
"$BT/apksigner" verify --print-certs "$OUT" || die "签名校验未通过，请检查 keystore / 密码"

SIZE=$(du -h "$OUT" | cut -f1)
SHA=$(sha256sum "$OUT" | cut -d' ' -f1)
FINGER=$("$JAVA_HOME/bin/keytool" -list -keystore "$KS" -alias "$ALIAS" -storepass "$PASS" 2>/dev/null | grep -i "SHA256" | head -1 | sed 's/^[^:]*: //')

echo
echo "============================================================"
echo " ✓ 已生成 $OUT"
echo "   大小    : $SIZE"
echo "   sha256  : $SHA"
[ -n "$FINGER" ] && echo "   签名指纹 : $FINGER"
echo "   安装    : adb install -r \"$OUT\""
echo "============================================================"
