"""Export what the hosted website cannot compute in the browser into public/hosted/.

The hosted site has no Python server. Readings come from the JavaScript twin that the mobile
app already uses, and these files carry the real model's terrain, layers and evaluation.
Run from the project root:  python scripts/export_hosted.py
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402

from backend import main as api  # noqa: E402
from backend import region  # noqa: E402

OUT = ROOT / "public" / "hosted"
OUT.mkdir(parents=True, exist_ok=True)


def plain(v):
    if isinstance(v, dict):
        return {str(k): plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [plain(x) for x in v]
    if isinstance(v, np.ndarray):
        return plain(v.tolist())
    if isinstance(v, np.generic):
        return plain(v.item())
    if isinstance(v, float):
        return None if v != v else round(v, 7)
    return v


def write(name, value):
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(plain(value), separators=(",", ":")), encoding="utf-8")
    print(f"{name}: {path.stat().st_size / 1024:.0f} KB")


def main():
    P = api.P
    write("terrain", P.twin.terrain_grid())
    write("static", asyncio.run(api.static()))
    for index in ("risk", "turbidity", "ph", "tds", "bio"):
        write(f"heatmap-{index}", P.twin.risk_grid(index))
    write("heatmap-bicol", region.grid())
    for name in ("wells", "runoff", "access"):
        write(f"layer-{name}", P.layer_grid(name))
    write("evaluation", json.loads((ROOT / "backend" / "data" / "evaluation.json").read_text()))


if __name__ == "__main__":
    main()
