#!/usr/bin/env python3
"""Audit raw relic-cleanup screenshots and generate deterministic template assets."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

try:
    import cv2
except ImportError as error:  # pragma: no cover - environment-specific guidance
    raise SystemExit("缺少 Python OpenCV：请先安装 opencv-python 后再生成模板") from error


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = ROOT / "tests/fixtures/relic-cleanup"
RAW_ROOT = FIXTURE_ROOT / "raw"
CONFIG_PATH = FIXTURE_ROOT / "calibration-regions.json"
OUTPUT_ROOT = ROOT / "src-tauri/assets/relic-cleanup/zh-CN"
NAME_RE = re.compile(
    r"^zh-CN__(?P<width>\d+)x(?P<height>\d+)__(windowed|fullscreen)__"
    r"(100pct|125pct|150pct)__(?P<state>[a-z0-9-]+)__"
    r"(none-selected|one-selected|multi-selected|not-applicable)__(\d{3})\.png$"
)
REQUIRED_SIZES = {(1280, 720), (1920, 1080), (2560, 1440), (1280, 800), (1920, 1200)}
REQUIRED_STATES = {
    "salvage-grid", "relic-detail", "locked-relic", "equipped-relic", "scroll-middle",
    "scroll-bottom", "sort-popup", "final-confirm", "confirm-cancelled", "loading",
    "occluded", "wrong-page",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def audit() -> tuple[list[dict], list[str]]:
    records: list[dict] = []
    errors: list[str] = []
    for path in sorted(RAW_ROOT.glob("*.png")):
        match = NAME_RE.match(path.name)
        if not match:
            errors.append(f"命名不符合规范：{path.name}")
            continue
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None:
            errors.append(f"PNG 无法读取：{path.name}")
            continue
        width, height = int(match["width"]), int(match["height"])
        if (image.shape[1], image.shape[0]) != (width, height):
            errors.append(f"尺寸字段与图片不一致：{path.name}，实际 {image.shape[1]}x{image.shape[0]}")
            continue
        records.append({"path": path, "size": (width, height), "state": match["state"]})
    covered_sizes = {record["size"] for record in records}
    for size in sorted(REQUIRED_SIZES - covered_sizes):
        errors.append(f"缺少分辨率：{size[0]}x{size[1]}")
    covered_states = {record["state"] for record in records}
    for state in sorted(REQUIRED_STATES - covered_states):
        errors.append(f"缺少页面状态：{state}")
    return records, errors


def generate(records: list[dict]) -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    reference_name = config.get("referenceFile")
    regions = config.get("regions", [])
    if not reference_name or len(regions) < 2:
        raise SystemExit("需要在 calibration-regions.json 中设置参考截图和至少两个稳定锚点")
    reference_path = RAW_ROOT / reference_name
    if not any(record["path"] == reference_path for record in records):
        raise SystemExit("referenceFile 不存在或未通过审计")
    image = cv2.imread(str(reference_path), cv2.IMREAD_COLOR)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    files = []
    for region in regions:
        name = region["name"]
        x, y, width, height = map(int, region["rect"])
        crop = image[y : y + height, x : x + width]
        if crop.size == 0:
            raise SystemExit(f"模板区域越界：{name}")
        destination = OUTPUT_ROOT / f"{name}.png"
        if not cv2.imwrite(str(destination), crop):
            raise SystemExit(f"无法写入模板：{destination}")
        files.append({"name": name, "path": destination.name, "sha256": sha256(destination), "rect": [x, y, width, height]})
    manifest = {
        "schemaVersion": 1,
        "revision": f"zh-CN-{sha256(CONFIG_PATH)[:12]}",
        "calibrated": False,
        "referenceSize": [image.shape[1], image.shape[0]],
        "anchors": files,
        "thresholds": config.get("thresholds", {}),
        "notice": "生成后仍需完成视觉回归与 Windows 人工验收，验收程序才可签署 calibrated=true。",
    }
    temporary = OUTPUT_ROOT / "template-manifest.json.part"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT_ROOT / "template-manifest.json")
    print(f"已生成 {len(files)} 个模板；清单保持 calibrated=false，等待回归验收。")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", action="store_true")
    parser.add_argument("--generate", action="store_true")
    args = parser.parse_args()
    records, errors = audit()
    print(f"有效原始截图：{len(records)}")
    for error in errors:
        print(f"- {error}")
    if errors:
        raise SystemExit(1)
    if args.generate:
        generate(records)
    elif not args.audit:
        parser.error("请指定 --audit 或 --generate")


if __name__ == "__main__":
    main()
