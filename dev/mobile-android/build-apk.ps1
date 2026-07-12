$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$sdk = "C:\Users\shen\AppData\Local\Android\Sdk"
$javaHome = "D:\Android Studio\jbr"
$buildTools = Join-Path $sdk "build-tools\37.0.0"
$platformJar = Join-Path $sdk "platforms\android-36.1\android.jar"
$packageName = "com.gggl.smanage"
$versionCode = "3"
$versionName = "1.0.2"
$appName = -join ([char[]](0x6837, 0x54C1, 0x91C7, 0x96C6))
$appNameDev = "$appName Dev"
$officialDirName = -join ([char[]](0x6B63, 0x5F0F, 0x7248))
$apkFileName = (-join ([char[]](0x624B, 0x673A, 0x7AEF))) + ".apk"
$devSubtitle = (-join ([char[]](0x5F00, 0x53D1, 0x73AF, 0x5883))) + " - " + (-join ([char[]](0x4E2A, 0x4EBA, 0x672C, 0x5730, 0x4F7F, 0x7528))) + " - " + (-join ([char[]](0x6570, 0x636E, 0x5305, 0x540C, 0x6B65)))
$productionSubtitle = (-join ([char[]](0x6B63, 0x5F0F, 0x7248))) + " - " + (-join ([char[]](0x4E2A, 0x4EBA, 0x672C, 0x5730, 0x4F7F, 0x7528))) + " - " + (-join ([char[]](0x6570, 0x636E, 0x5305, 0x540C, 0x6B65)))

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$javaHome\bin;$sdk\platform-tools;$sdk\cmdline-tools\latest\bin;$buildTools;$env:Path"

$work = Join-Path $root "build\mobile-android"
$assets = Join-Path $work "assets\www"
$classes = Join-Path $work "classes"
$dex = Join-Path $work "dex"
$resCompiled = Join-Path $work "compiled-res"
$out = Join-Path (Join-Path $root "release\$officialDirName") $apkFileName
$unsigned = Join-Path $work "unsigned.apk"
$aligned = Join-Path $work "aligned.apk"
$signed = Join-Path $work "signed.apk"
$keystore = Join-Path $PSScriptRoot "smanage-release.keystore"

function Invoke-Checked {
    param([Parameter(Mandatory=$true)][string]$FilePath, [Parameter(Mandatory=$true)][object[]]$ArgumentList)
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
    }
}

if (!(Test-Path $javaHome)) { throw "JAVA_HOME not found: $javaHome" }
if (!(Test-Path $sdk)) { throw "Android SDK not found: $sdk" }
if (!(Test-Path $platformJar)) { throw "Android platform jar not found: $platformJar" }

New-Item -ItemType Directory -Force -Path $work, $assets, $classes, $dex, $resCompiled, (Split-Path $out) | Out-Null
Remove-Item -Recurse -Force -LiteralPath $assets -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $assets | Out-Null

Copy-Item -Recurse -Force -Path (Join-Path $root "dev\mobile\assets") -Destination $assets
Copy-Item -Force -Path (Join-Path $root "dev\mobile\styles.css") -Destination $assets

$index = Get-Content -LiteralPath (Join-Path $root "dev\mobile\index.html") -Encoding UTF8 -Raw
$index = $index.Replace("<title>$appNameDev</title>", "<title>$appName</title>")
Set-Content -LiteralPath (Join-Path $assets "index.html") -Encoding UTF8 -Value $index

$manifest = Get-Content -LiteralPath (Join-Path $root "dev\mobile\manifest.json") -Encoding UTF8 -Raw
$manifest = $manifest.Replace($appNameDev, $appName)
Set-Content -LiteralPath (Join-Path $assets "manifest.json") -Encoding UTF8 -Value $manifest

$app = Get-Content -LiteralPath (Join-Path $root "dev\mobile\app.js") -Encoding UTF8 -Raw
$app = $app.Replace('const APP_ENV = "dev";', 'const APP_ENV = "production";')
$app = $app.Replace("const APP_NAME = `"$appNameDev`";", "const APP_NAME = `"$appName`";")
$app = $app.Replace('const DB_NAME = "sample-mobile-db-dev";', 'const DB_NAME = "sample-mobile-db";')
$pageShellReplacement = "return pageShell(APP_NAME, `"$productionSubtitle`", ``"
$app = [regex]::Replace($app, 'return pageShell\(APP_NAME, "[^"]*", `', $pageShellReplacement)
$app = $app.Replace('const fileName = `sample_sync_${APP_ENV}_${formatStamp(new Date())}.zip`;', 'const fileName = APP_ENV === "production" ? `sample_sync_${formatStamp(new Date())}.zip` : `sample_sync_${APP_ENV}_${formatStamp(new Date())}.zip`;')
Set-Content -LiteralPath (Join-Path $assets "app.js") -Encoding UTF8 -Value $app

New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot "res\drawable") | Out-Null
Copy-Item -Force -Path (Join-Path $root "dev\mobile\assets\icons\app-icon.png") -Destination (Join-Path $PSScriptRoot "res\drawable\app_icon.png")

Remove-Item -Recurse -Force -LiteralPath $classes, $dex, $resCompiled -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $classes, $dex, $resCompiled | Out-Null

$compiledResources = Get-ChildItem -Recurse -File -Path $resCompiled -Filter *.flat | ForEach-Object { $_.FullName }
Invoke-Checked (Join-Path $buildTools "aapt2.exe") @("compile", "--dir", (Join-Path $PSScriptRoot "res"), "-o", $resCompiled)
$compiledResources = Get-ChildItem -Recurse -File -Path $resCompiled -Filter *.flat | ForEach-Object { $_.FullName }
Invoke-Checked (Join-Path $buildTools "aapt2.exe") (@("link", "-o", $unsigned, "-I", $platformJar, "--manifest", (Join-Path $PSScriptRoot "AndroidManifest.xml"), "--java", (Join-Path $work "gen"), "--min-sdk-version", "23", "--target-sdk-version", "36", "--version-code", $versionCode, "--version-name", $versionName) + $compiledResources)

$javaFiles = Get-ChildItem -Recurse -File -Path (Join-Path $PSScriptRoot "src"), (Join-Path $work "gen") -Filter *.java | ForEach-Object { $_.FullName }
Invoke-Checked (Join-Path $javaHome "bin\javac.exe") (@("-encoding", "UTF-8", "-source", "8", "-target", "8", "-classpath", $platformJar, "-d", $classes) + $javaFiles)
$classFiles = Get-ChildItem -Recurse -File -Path $classes -Filter *.class | ForEach-Object { $_.FullName }
Invoke-Checked (Join-Path $buildTools "d8.bat") (@("--lib", $platformJar, "--output", $dex) + $classFiles)

Invoke-Checked (Join-Path $buildTools "aapt2.exe") (@("link", "-o", $unsigned, "-I", $platformJar, "--manifest", (Join-Path $PSScriptRoot "AndroidManifest.xml"), "--java", (Join-Path $work "gen"), "--min-sdk-version", "23", "--target-sdk-version", "36", "--version-code", $versionCode, "--version-name", $versionName) + $compiledResources)
Invoke-Checked (Join-Path $javaHome "bin\jar.exe") @("uf", $unsigned, "-C", $dex, "classes.dex", "-C", $work, "assets")

if (!(Test-Path $keystore)) {
    Invoke-Checked (Join-Path $javaHome "bin\keytool.exe") @("-genkeypair", "-v", "-keystore", $keystore, "-storepass", "smanage123", "-keypass", "smanage123", "-alias", "smanage", "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", "CN=smanage, OU=Personal, O=gggl, L=Local, ST=Local, C=CN")
}

Remove-Item -Force -LiteralPath $aligned, $signed, $out -ErrorAction SilentlyContinue
Invoke-Checked (Join-Path $buildTools "zipalign.exe") @("-f", "-p", "4", $unsigned, $aligned)
Invoke-Checked (Join-Path $buildTools "apksigner.bat") @("sign", "--ks", $keystore, "--ks-pass", "pass:smanage123", "--key-pass", "pass:smanage123", "--out", $signed, $aligned)
Invoke-Checked (Join-Path $buildTools "apksigner.bat") @("verify", "--verbose", $signed)
Copy-Item -Force -LiteralPath $signed -Destination $out

Write-Host "APK written to $out"
