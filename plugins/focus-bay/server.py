"""
Focus Bay plugin server: YOLO26 phone detection + static web UI, single port.

Serves:
  GET  /            the Focus Bay web app (web/index.html)
  GET  /healthz     engine status (model, device, names)
  POST /detect      JSON { image: dataURL, min_conf?, imgsz? } -> boxes

Environment variables (all optional):
  PL_YOLO_MODEL    weights path, default weights/best.pt
  PL_YOLO_DEVICE   e.g. cpu / mps / 0; auto picks cuda > mps > cpu
  PL_YOLO_HOST     default 127.0.0.1
  PL_YOLO_PORT     default 8800
  PL_DEFAULT_IMGSZ default inference size when request omits imgsz, default 480
"""
from __future__ import annotations

import base64
import io
import os
import threading
import time
from pathlib import Path

os.environ.setdefault("MPLBACKEND", "Agg")
# macOS: torch + other libs may each ship an OpenMP runtime; without this the
# process aborts with "OMP: Error #15" on startup.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

from flask import Flask, jsonify, request, send_from_directory
from PIL import Image
from ultralytics import YOLO

_ROOT = Path(__file__).resolve().parent
_WEB_DIR = _ROOT / "web"
_DEFAULT_WEIGHTS = _ROOT / "weights" / "best.pt"

_MAX_IMAGE_BYTES = 8 * 1024 * 1024


def _model_path() -> Path:
    raw = (os.environ.get("PL_YOLO_MODEL") or "").strip()
    p = Path(raw) if raw else _DEFAULT_WEIGHTS
    if not p.is_absolute():
        p = (_ROOT / p).resolve()
    return p


def _pick_device() -> str:
    d = (os.environ.get("PL_YOLO_DEVICE") or "").strip()
    if d:
        return d
    import torch

    if torch.cuda.is_available():
        return "0"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _decode_data_url(data_url: str) -> Image.Image:
    if not data_url:
        raise ValueError("missing image")
    if "," in data_url:
        _, b64 = data_url.split(",", 1)
    else:
        b64 = data_url
    if len(b64) > _MAX_IMAGE_BYTES:
        raise ValueError("image too large")
    raw = base64.b64decode(b64, validate=False)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _clamp_imgsz(value: int) -> int:
    value = max(160, min(1280, value))
    return int(round(value / 32) * 32)


def _boxes_payload(r) -> list[dict]:
    out: list[dict] = []
    if r.boxes is None or len(r.boxes) == 0:
        return out
    names = r.names or {}
    xywhn = r.boxes.xywhn.cpu().numpy()
    confs = r.boxes.conf.cpu().numpy()
    clss = r.boxes.cls.cpu().numpy().astype(int)
    for i in range(len(xywhn)):
        cx, cy, bw, bh = (float(x) for x in xywhn[i])
        x = cx - bw / 2.0
        y = cy - bh / 2.0
        cls = int(clss[i])
        raw_label = names.get(cls, str(cls))
        label = raw_label if isinstance(raw_label, str) else str(raw_label)
        out.append(
            {
                "x": max(0.0, min(1.0, x)),
                "y": max(0.0, min(1.0, y)),
                "w": max(0.0, min(1.0, bw)),
                "h": max(0.0, min(1.0, bh)),
                "conf": float(confs[i]),
                "cls": cls,
                "label": label,
            }
        )
    return out


weights_path = _model_path()
if not weights_path.is_file():
    raise SystemExit(
        f"weights not found: {weights_path}\n"
        "Set PL_YOLO_MODEL or place best.pt under weights/."
    )

device = _pick_device()
model = YOLO(str(weights_path))
# Ultralytics predict is not thread-safe; Flask runs threaded.
_model_lock = threading.Lock()

# Warm up so the first real frame does not time out.
_warm = Image.new("RGB", (640, 480), (32, 32, 32))
with _model_lock:
    model.predict(_warm, imgsz=480, conf=0.5, device=device, verbose=False)

app = Flask(__name__)


@app.get("/")
def index():
    return send_from_directory(_WEB_DIR, "index.html")


@app.get("/healthz")
def healthz():
    names = model.names if isinstance(model.names, dict) else {i: str(n) for i, n in enumerate(model.names or [])}
    default_imgsz = int(os.environ.get("PL_DEFAULT_IMGSZ", "480"))
    return jsonify(
        ok=True,
        model=weights_path.name,
        device=str(device),
        imgsz=default_imgsz,
        names=names,
    )


@app.post("/detect")
def detect():
    t_frame0 = time.perf_counter()
    payload = request.get_json(silent=True) or {}
    try:
        pil = _decode_data_url(str(payload.get("image", "")))
    except Exception as e:
        return jsonify(error=f"bad image: {e}"), 400

    try:
        min_conf = float(payload.get("min_conf", 0.4))
    except (TypeError, ValueError):
        min_conf = 0.4
    min_conf = max(0.05, min(0.95, min_conf))

    default_imgsz = int(os.environ.get("PL_DEFAULT_IMGSZ", "480"))
    try:
        imgsz = _clamp_imgsz(int(payload.get("imgsz") or default_imgsz))
    except (TypeError, ValueError):
        imgsz = default_imgsz

    t_infer0 = time.perf_counter()
    with _model_lock:
        results = model.predict(pil, imgsz=imgsz, conf=min_conf, device=device, verbose=False)
    t_infer1 = time.perf_counter()

    r = results[0]
    h, w = (int(x) for x in r.orig_shape)
    boxes = _boxes_payload(r)
    inference_ms = (t_infer1 - t_infer0) * 1000.0
    frame_ms = (time.perf_counter() - t_frame0) * 1000.0

    return jsonify(
        boxes=boxes,
        inference_ms=inference_ms,
        frame_ms=frame_ms,
        width=w,
        height=h,
        model=weights_path.name,
        device=str(device),
    )


def main():
    host = os.environ.get("PL_YOLO_HOST", "127.0.0.1")
    port = int(os.environ.get("PL_YOLO_PORT", "8800"))
    print(f"[focus-bay] serving {host}:{port}  model={weights_path.name}  device={device}", flush=True)
    app.run(host=host, port=port, threaded=True)


if __name__ == "__main__":
    main()
