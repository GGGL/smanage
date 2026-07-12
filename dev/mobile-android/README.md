# Mobile Android Package

This directory contains a small native Android WebView wrapper for the static mobile web app in `dev/mobile`.

It intentionally avoids Gradle so the APK can be built with the installed Android SDK tools only.

Build:

```powershell
powershell -ExecutionPolicy Bypass -File dev\mobile-android\build-apk.ps1
```

Output:

```text
release/正式版/手机端.apk
```

