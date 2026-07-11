# 样品采集管理项目

当前目录已经按用途分开：

```text
smanage/
  dev/                 开发区：源码、设计稿、技术文档
  release/正式版/       正式交付区：最终可运行的桌面端 exe 和手机端 apk
```

## 开发区

```text
dev/
  mobile/              手机端开发源码
  desktop/             电脑端开发源码
  docs/
    设计稿/             SVG 原型和设计稿
    技术开发文档/        业务流程、技术栈、交互说明
```

电脑端开发运行：

```powershell
python dev\desktop\run.py
```

手机端开发预览：

```powershell
python -m http.server 5175
```

在 `dev/mobile` 目录下启动后访问：

```text
http://127.0.0.1:5175/
```

## 正式版区

```text
release/正式版/
  桌面端/              放最终的一键打开桌面端 exe
  手机端/              放最终的手机端 apk
```

注意：正式版文件夹只放最终可运行交付物，不放开发源码和测试数据。
