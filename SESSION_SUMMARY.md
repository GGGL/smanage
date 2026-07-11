# SESSION SUMMARY

本文件用于让另一台电脑上的 Codex 无缝继续当前项目。

## 项目目标

开发一个个人使用的样品采集管理工具：

- 手机端：现场拍照、录入样品、按项目查看、导入导出同步包。
- 电脑端：导入手机包、按项目管理样品、修改内容、导出同步包给手机。
- 不依赖云服务器，通过 zip 数据包双向同步。

## 当前目录

```text
G:\20260515\smanage
```

主要结构：

```text
dev/
  mobile/
  desktop/
  docs/
release/
  正式版/
```

## 已完成内容

### 手机端

位置：

```text
dev/mobile/
```

主要文件：

```text
index.html
app.js
styles.css
manifest.json
assets/icons/app-icon.png
exports/
```

已实现：

- 首页三入口：录入、查看、同步。
- 录入路径：拍照/选图、填写样品信息、选择已有项目或填写新项目名称。
- 查看路径：项目列表、项目详情、产品详情。
- 项目列表可编辑项目名称。
- 项目详情有“补录”按钮，跳到录入页面并预选当前项目。
- 产品详情去掉了可见状态/待确认展示。
- 同步中心：
  - 导出给电脑：生成 zip。
  - 导入电脑同步包：先选择文件，显示文件名和大小，再确认导入。
  - 导入成功显示绿色提示。
  - 导入失败显示红色提示。

开发预览：

```powershell
cd dev\mobile
python -m http.server 5175
```

访问：

```text
http://127.0.0.1:5175/
```

注意：

- 当前手机端还是静态 Web 版本。
- APK 未打包。
- 当前开发版配置是 dev：
  - `APP_ENV = "dev"`
  - `APP_NAME = "样品采集 Dev"`
  - `DB_NAME = "sample-mobile-db-dev"`

正式 APK 需要改为 production：

```text
APP_ENV = production
APP_NAME = 样品采集
DB_NAME = sample-mobile-db
包名 = com.gggl.smanage
```

### 电脑端

位置：

```text
dev/desktop/
```

主要文件：

```text
run.py
app/server.py
app/static/index.html
app/static/app.js
app/static/styles.css
```

已实现：

- 左侧栏目：项目、导入导出。
- 项目列表只加载项目汇总。
- 项目详情只加载当前项目样品。
- 项目详情页已改为 table/list 风格：
  - 待确认勾选
  - 图片
  - 图片名称
  - 规格
  - 产地
  - 价格
  - 状态
  - 操作
- 待确认样品支持：
  - 单条确认
  - 表头全选待确认
  - 确认选中
- 样品详情可修改名称、规格、产地、价格、状态、备注。
- 支持导入手机端 zip 包。
- 支持导出同步包给手机。
- 支持导出当前项目 Excel。
- 导入前自动备份数据库。

开发运行：

```powershell
python dev\desktop\run.py --no-browser
```

### 正式版电脑端

已生成：

```text
release/正式版/打开桌面端.exe
```

正式版结构：

```text
release/正式版/
  打开桌面端.exe
  正式版说明.md
  数据包/
    手机导出给电脑/
    电脑导出给手机/
  数据备份/
```

production 逻辑：

- exe 默认 production。
- 源码运行默认 dev。
- exe 数据目录在同级浅层：

```text
release/正式版/数据/
release/正式版/数据包/电脑导出给手机/
release/正式版/数据包/手机导出给电脑/
release/正式版/数据备份/
```

端口逻辑：

- 默认 `8765`。
- 如果占用，自动尝试 `8766` 到后续端口。

已验证：

- 当开发版占用 `8765` 时，正式版可自动切到 `8766`。
- `/api/env` 返回 production 时表示正式版运行正确。

## 未完成内容

### APK 未生成

当前电脑缺少 Android 打包环境：

- 没有 Java/JDK。
- 没有 Gradle。
- 没有 Android SDK。
- 没有 Android Studio。
- 没有 Capacitor Android 工程。

曾尝试请求下载：

- JDK 21
- Android command line tools

但用户决定换电脑继续，因此未下载。

下一台电脑继续时，优先完成 APK 打包。

## 建议下一步

1. 在新电脑安装或确认：
   - Node/npm
   - JDK 17 或 21
   - Android Studio / Android SDK
   - Gradle 或 Android Gradle Plugin
2. 读取本文件和 `TODO.md`。
3. 为 `dev/mobile` 创建 Android WebView/Capacitor 打包工程。
4. 使用 production 配置生成 APK。
5. 输出到：

```text
release/正式版/手机端.apk
```

6. 进行完整同步闭环测试：

```text
手机录入
手机导出给电脑
电脑导入
电脑修改
电脑导出给手机
手机导入
```

## 不要做的事

- 不要放假的 `手机端.apk`。
- 不要把 dev 包名当正式包名。
- 不要让正式版使用 `sample-mobile-db-dev`。
- 不要让正式版电脑端使用 `dev/desktop/app/data-dev/`。
- 不要随意删除用户已有数据包和数据库备份。

## 当前 git 状态说明

用户之前明确说过“不用提交 git”。本轮没有提交。

当前工作区包含多处未提交修改，主要是：

- 手机端同步导入确认和提示。
- 电脑端项目详情表格和批量确认。
- 电脑端 production 数据目录和正式 exe 打包逻辑。
- 正式版目录结构和说明。
- 新增本交接文件。
