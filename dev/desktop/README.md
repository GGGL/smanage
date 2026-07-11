# 电脑端样品管理

电脑端第一版用于跑通核心闭环。当前默认是开发环境：

```text
应用名：样品管理 Dev
环境：dev
数据目录：dev/desktop/app/data-dev/
导出包：sample_sync_dev_desktop_时间.zip
```

```text
导入手机采集包
→ 项目列表
→ 项目详情
→ 调整样品具体内容
→ 导出同步包给手机
```

## 运行

```powershell
python dev\desktop\run.py
```

启动后会打开：

```text
http://127.0.0.1:8765/
```

## 当前能力

- 左侧只保留“项目”和“导入导出”。
- 项目列表页只加载项目汇总。
- 项目详情页只加载当前项目样品。
- 样品调整页只加载当前样品详情和图片。
- 新建/调整项目使用页面弹窗，不跳转页面。
- 支持导入手机端导出的 zip 包。
- 支持调整样品名称、规格、产地、价格、状态、备注。
- 支持按当前项目导出 Excel。
- 支持导出同步包给手机端导入。
- 导入前自动备份 SQLite 数据库。

## 数据目录

```text
dev/desktop/app/data-dev/
  samples.db
  images/
  backups/
  exports/
```

## 正式版目录

正式版使用 production 配置，数据放在 exe 同级浅层目录：

```text
正式版/
  打开桌面端.exe
  数据/
    samples.db
    images/
  数据包/
    手机导出给电脑/
    电脑导出给手机/
  数据备份/
```

电脑端导出的同步包默认进入：

```text
正式版/数据包/电脑导出给手机/
```
