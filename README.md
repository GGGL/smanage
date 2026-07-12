# 样品采集管理项目

个人使用的样品采集与管理工具。手机端负责现场拍照录入，电脑端负责按项目整理、修改、导入导出同步包。

## 当前状态

- 手机端：纯 Web 应用原型已可用，位于 `dev/mobile/`。
- 电脑端：Python 本地 Web 管理程序已可用，位于 `dev/desktop/`。
- 正式版电脑端 exe：已生成，位于 `release/正式版/打开桌面端.exe`。
- 正式版 APK：已生成，位于 `release/正式版/手机端.apk`。
- 数据同步：通过 zip 包双向同步，已实现手机导出、手机导入确认、电脑导入、电脑导出。

## 目录结构

```text
smanage/
  dev/
    mobile/              手机端源码和本地预览文件
    desktop/             电脑端源码
    docs/                技术文档和设计稿
  release/
    正式版/
      打开桌面端.exe
      手机端.apk
      数据包/
        手机导出给电脑/
        电脑导出给手机/
      数据备份/
```

## 开发运行

电脑端：

```powershell
python dev\desktop\run.py --no-browser
```

默认访问：

```text
http://127.0.0.1:8765/
```

手机端预览：

```powershell
cd dev\mobile
python -m http.server 5175
```

访问：

```text
http://127.0.0.1:5175/
```

## 正式版说明

正式版电脑端 exe 默认是 production 环境。双击 `release/正式版/打开桌面端.exe` 后，会在同级创建/使用：

```text
数据/
数据包/
数据备份/
```

如果端口 `8765` 被占用，电脑端会自动使用 `8766` 等后续端口。

## 交接文件

- `TODO.md`：下一步待办。
- `SESSION_SUMMARY.md`：给下一台电脑上的 Codex 读取的完整交接摘要。
