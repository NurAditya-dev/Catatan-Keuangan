$ErrorActionPreference = "Stop"

$ROOT_DIR = "d:\VS CODE\Catatan Keuangan"
$BUILD_DIR = "$ROOT_DIR\android-build"
$SDK_DIR = "C:\Users\LOQ\AppData\Local\Android\Sdk"
$BUILD_TOOLS_DIR = "$SDK_DIR\build-tools\36.1.0"
$PLATFORM_JAR = "$SDK_DIR\platforms\android-36\android.jar"
$JAVA_HOME = "C:\Program Files\Android\Android Studio\jre"

$env:JAVA_HOME = $JAVA_HOME
$env:Path = "$JAVA_HOME\bin;$env:Path"

Write-Host ">>> [1/7] Menyiapkan folder output..."
$BIN_DIR = "$BUILD_DIR\bin"
$OBJ_DIR = "$BUILD_DIR\obj"
if (Test-Path $BIN_DIR) { Remove-Item -Recurse -Force $BIN_DIR }
if (Test-Path $OBJ_DIR) { Remove-Item -Recurse -Force $OBJ_DIR }
New-Item -ItemType Directory -Path $BIN_DIR -Force | Out-Null
New-Item -ItemType Directory -Path $OBJ_DIR -Force | Out-Null
New-Item -ItemType Directory -Path "$BUILD_DIR\gen" -Force | Out-Null

Write-Host ">>> [2/7] Mengompilasi resource Android dengan aapt2..."
& "$BUILD_TOOLS_DIR\aapt2.exe" compile --dir "$BUILD_DIR\res" -o "$BIN_DIR\resources.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile gagal!" }

Write-Host ">>> [3/7] Menghubungkan manifest dan resources (aapt2 link)..."
& "$BUILD_TOOLS_DIR\aapt2.exe" link -o "$BIN_DIR\unaligned.apk" `
    -I $PLATFORM_JAR `
    --manifest "$BUILD_DIR\AndroidManifest.xml" `
    --java "$BUILD_DIR\gen" `
    -A "$BUILD_DIR\assets" `
    "$BIN_DIR\resources.zip" --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "aapt2 link gagal!" }

Write-Host ">>> [4/7] Mengompilasi kode Java (javac)..."
$JAVA_FILES = Get-ChildItem -Recurse -Path "$BUILD_DIR\src", "$BUILD_DIR\gen" -Filter "*.java" | ForEach-Object { $_.FullName }
& javac -source 8 -target 8 -bootclasspath $PLATFORM_JAR -d $OBJ_DIR $JAVA_FILES
if ($LASTEXITCODE -ne 0) { throw "javac compile gagal!" }

Write-Host ">>> [5/7] Mengonversi bytecode ke format Android Dex (d8)..."
$CLASS_FILES = Get-ChildItem -Recurse -Path $OBJ_DIR -Filter "*.class" | ForEach-Object { "`"$($_.FullName)`"" }
$D8_ARGS = @("--output", "`"$BIN_DIR`"", "--lib", "`"$PLATFORM_JAR`"") + $CLASS_FILES
& cmd /c "`"$BUILD_TOOLS_DIR\d8.bat`" $($D8_ARGS -join ' ')"
if ($LASTEXITCODE -ne 0) { throw "d8 dexing gagal!" }

Write-Host ">>> [6/7] Menambahkan classes.dex ke dalam paket APK..."
& node "$ROOT_DIR\add-to-zip.js" "$BIN_DIR\unaligned.apk" "classes.dex" "$BIN_DIR\classes.dex"
if ($LASTEXITCODE -ne 0) { throw "Memasukkan classes.dex gagal!" }

Write-Host ">>> [7/7] Zipalign dan Sign APK..."
$ALIGNED_APK = "$BUILD_DIR\UangKu-aligned.apk"
$FINAL_APK = "$ROOT_DIR\UangKu.apk"
if (Test-Path $ALIGNED_APK) { Remove-Item $ALIGNED_APK }
if (Test-Path $FINAL_APK) { Remove-Item $FINAL_APK }

& "$BUILD_TOOLS_DIR\zipalign.exe" -v -p 4 "$BIN_DIR\unaligned.apk" $ALIGNED_APK
if ($LASTEXITCODE -ne 0) { throw "zipalign gagal!" }

$KEYSTORE = "$BUILD_DIR\release.keystore"
if (-not (Test-Path $KEYSTORE)) {
    Write-Host ">>> Membuat keystore sertifikat lokal..."
    & keytool -genkeypair -validity 10000 -dname "CN=UangKu, OU=App, O=UangKu, C=ID" -keystore $KEYSTORE -storepass "uangku123" -keypass "uangku123" -alias "uangku" -keyalg RSA -keysize 2048
}

& cmd /c "`"$BUILD_TOOLS_DIR\apksigner.bat`" sign --ks `"$KEYSTORE`" --ks-pass pass:uangku123 --ks-key-alias uangku --key-pass pass:uangku123 --out `"$FINAL_APK`" `"$ALIGNED_APK`""
if ($LASTEXITCODE -ne 0) { throw "apksigner gagal!" }

Write-Host "`n========================================================"
Write-Host "  SUKSES! APK Android 'UangKu.apk' Berhasil Dibuat!"
Write-Host "  Lokasi File: $FINAL_APK"
Write-Host "========================================================"
