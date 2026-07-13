# Focus Bay · YOLO26 手机监测插件

PlainList 插件市场中的 widget 插件。用一颗摄像头 + 本地 YOLO26 模型检测桌面上出现的手机，
统计专注 / 分心时长、拿起手机次数、最长专注连击，并支持「检测到手机自动暂停会话」。

## 组成

```
plugins/focus-bay/
├── start.sh           # PlainList widget sidecar 入口（自动建 venv、装依赖、启动服务）
├── server.py          # Flask：YOLO26 推理 (/detect, /healthz) + 静态托管前端 (/)
├── requirements.txt   # ultralytics + flask
├── weights/best.pt    # 训练好的 YOLO26n 手机检测权重（~5MB，8200 张标注图训练）
└── web/index.html     # 独立前端（零依赖单文件），通过 iframe 嵌入 PlainList
```

## 工作方式

- 安装：在 PlainList 插件市场点击安装。API 会把本目录复制到 `data/widgets/focus-bay/`
  并执行 `start.sh`（manifest 里的 `sourcePath` 指向这里，无需 git clone）。
- 运行：服务监听 `127.0.0.1:8800`，前端与推理同源同端口，摄像头画面永不离开本机。
- 卸载：停止 sidecar 并删除 `data/widgets/focus-bay/`，本源目录不受影响。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PL_YOLO_MODEL` | `weights/best.pt` | 权重路径 |
| `PL_YOLO_DEVICE` | 自动 (cuda > mps > cpu) | 推理设备 |
| `PL_YOLO_PORT` | `8800` | 服务端口 |
| `PL_DEFAULT_IMGSZ` | `480` | 默认推理输入边长 |
| `PL_PYTHON` | `python3` | 建 venv 用的 Python |

## 单独调试

```bash
cd plugins/focus-bay
./start.sh
# 浏览器打开 http://127.0.0.1:8800
```
