#!/usr/bin/env bash
# 小日子 · Android 构建脚本
# 依赖：JDK 17、Android SDK（platforms;android-34 + build-tools;34.0.0）、python3
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/app"
OUT="$ROOT/build"
RES="$ROOT/resign"   # 签名密钥放这里，务必保留，否则以后无法覆盖升级

: "${JAVA_HOME:?请先设置 JAVA_HOME 指向 JDK 17}"
: "${ANDROID_SDK_ROOT:?请先设置 ANDROID_SDK_ROOT 指向 Android SDK}"

BT="$ANDROID_SDK_ROOT/build-tools/34.0.0"
ANDROID_JAR="$ANDROID_SDK_ROOT/platforms/android-34/android.jar"
[ -x "$BT/aapt2" ] || { echo "找不到 aapt2: $BT/aapt2"; exit 1; }
[ -f "$ANDROID_JAR" ] || { echo "找不到 android.jar: $ANDROID_JAR"; exit 1; }

mkdir -p "$OUT" "$RES"

echo "==> 1/6 生成 R.java 与资源包"
"$BT/aapt2" compile --dir "$APP/src/main/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/app.unsigned.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$APP/src/main/AndroidManifest.xml" \
  --java "$OUT/gen" \
  --min-sdk-version 23 --target-sdk-version 34 \
  --version-code 1 --version-name 1.0 \
  -A "$APP/src/main/assets" \
  "$OUT/res.zip"

echo "==> 2/6 编译 Java"
rm -rf "$OUT/classes" && mkdir -p "$OUT/classes"
find "$APP/src/main/java" -name '*.java' > "$OUT/sources.txt"
find "$OUT/gen" -name '*.java' >> "$OUT/sources.txt"
"$JAVA_HOME/bin/javac" -source 8 -target 8 -encoding UTF-8 -nowarn \
  -classpath "$ANDROID_JAR" \
  -d "$OUT/classes" @"$OUT/sources.txt"

echo "==> 3/6 dex"
rm -f "$OUT/classes.dex"
"$BT/d8" --release --min-api 23 --lib "$ANDROID_JAR" \
  --output "$OUT" $(find "$OUT/classes" -name '*.class')
[ -f "$OUT/classes.dex" ] || { echo "dex 生成失败"; exit 1; }

echo "==> 4/6 打包 APK（不压缩 dex）"
cd "$OUT"
cp app.unsigned.apk app.unsigned.base.apk
cd "$ROOT"
python3 - "$OUT" <<'PY'
import sys, zipfile, os, shutil
out = sys.argv[1]
src = os.path.join(out, 'app.unsigned.base.apk')
dst = os.path.join(out, 'app.unsigned.apk')
zin = zipfile.ZipFile(src, 'r')
zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
dex = os.path.join(out, 'classes.dex')
for item in zin.infolist():
    data = zin.read(item.filename)
    # targetSdk 30+ 要求 resources.arsc 不压缩且 4 字节对齐
    if item.filename == 'resources.arsc' or item.filename.startswith('assets/'):
        zout.writestr(item, data, compress_type=zipfile.ZIP_STORED)
    else:
        zout.writestr(item, data, compress_type=zipfile.ZIP_DEFLATED)
zin.close()
# 放入 dex（必须不压缩）
zout.write(dex, 'classes.dex', compress_type=zipfile.ZIP_STORED)
zout.close()
print('   APK 条目数：', len(zipfile.ZipFile(dst).namelist()))
PY

echo "==> 5/6 zipalign"
"$BT/zipalign" -f -p 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"

echo "==> 6/6 签名"
if [ ! -f "$RES/xiaorizi.keystore" ]; then
  echo "    生成签名密钥（仅首次）"
  "$JAVA_HOME/bin/keytool" -genkeypair -v \
    -keystore "$RES/xiaorizi.keystore" -storepass xiaorizi2026 -keypass xiaorizi2026 \
    -alias xiaorizi -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=XiaoRiZi, OU=Personal, O=XiaoRiZi, L=Local, S=Local, C=CN" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$RES/xiaorizi.keystore" \
  --ks-pass pass:xiaorizi2026 --key-pass pass:xiaorizi2026 \
  --ks-key-alias xiaorizi \
  --min-sdk-version 23 \
  --out "$ROOT/xiaorizi-1.0.apk" "$OUT/app.aligned.apk"
"$BT/apksigner" verify --print-certs "$ROOT/xiaorizi-1.0.apk" | head -4
ls -lh "$ROOT/xiaorizi-1.0.apk"
echo "✅ 构建完成：$ROOT/xiaorizi-1.0.apk"
"$BT/apksigner" verify --print-certs "$ROOT/xiaorizi-1.0.apk" > "$ROOT/build/证书信息.txt" 2>&1 || true
shasum -a 256 "$ROOT/xiaorizi-1.0.apk" | awk '{print "SHA-256: "$1}' | tee "$ROOT/build/SHA256.txt"
