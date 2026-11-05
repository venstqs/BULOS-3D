"""
Bulos 3D API.

    python -m uvicorn backend.main:app --port 8000
    BULOS_DATA_SOURCE=live  ...   to run on real uplinks only (no virtual field)
"""
import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config as C
from . import ingest
from .platform_core import Platform

P = Platform()


async def _loop():
    while True:
        try:
            P.tick()
        except Exception as e:                       # keep the control loop alive
            print("tick error:", repr(e))
        await asyncio.sleep(C.TICK_REAL_S)


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(_loop())
    if os.getenv("MQTT_HOST"):
        from .mqtt_bridge import start
        start(P)
    yield
    task.cancel()


app = FastAPI(title="Bulos 3D API", version="3.0.0", lifespan=lifespan,
              description="Water-quality digital twin for rural gravity-fed networks.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _400(e):
    raise HTTPException(400, str(e))


# ------------------------------------------------------------------ read
@app.get("/api/health")
async def health():
    return dict(status="ok", mode=P.mode, t=P.t)


@app.get("/api/static")
async def static():
    return P.static()


@app.get("/api/state")
async def state():
    return P.state()


@app.get("/api/forecast")
async def forecast():
    return P.twin.forecast


@app.get("/api/heatmap")
async def heatmap(index: str = "risk"):
    try:
        return P.twin.risk_grid(index)
    except ValueError as e:
        _400(e)


@app.get("/api/terrain")
async def terrain():
    return P.twin.terrain_grid()


@app.get("/api/history/{station_id}")
async def history(station_id: str, minutes: int = 360):
    if station_id not in P.twin.stations:
        raise HTTPException(404, "unknown station")
    base = P.epoch0
    return dict(station_id=station_id, series=[
        dict(h, t_ms=int((base + h["t"]) * 1000)) for h in P.twin.history(station_id, minutes)])


@app.get("/api/compliance")
async def compliance(hours: float = 24):
    if not P.store:
        raise HTTPException(503, "storage disabled")
    return P.store.compliance(P.epoch() - hours * 3600)


@app.get("/api/audit")
async def audit(limit: int = 200):
    return P.store.recent_events(limit) if P.store else []


@app.get("/api/evaluation")
async def evaluation():
    """Latest simulated test results (python -m backend.tools.evaluate)."""
    path = Path(__file__).resolve().parent / "data" / "evaluation.json"
    if not path.exists():
        raise HTTPException(404, "not generated yet")
    return json.loads(path.read_text())


@app.get("/api/downlinks")
async def downlinks():
    return list(P.downlink_queue)


# ---------------------------------------------------------------- control
class ValveReq(BaseModel):
    station_id: str
    action: Literal["SHUT", "REARM", "FORCE_REARM"]
    operator: str = "LGU operator"
    reason: str = ""


@app.post("/api/valve")
async def valve(req: ValveReq):
    try:
        ok, msg = P.send_command(req.station_id, req.action, actor=req.operator, reason=req.reason)
    except KeyError:
        raise HTTPException(404, "unknown station")
    if not ok:
        raise HTTPException(409, msg)
    return dict(ok=ok, message=msg)


class CleanReq(BaseModel):
    station_id: str
    technician: str = "LGU sensor technician"


@app.post("/api/maintenance/clean")
async def clean(req: CleanReq):
    ok, msg = P.send_command(req.station_id, "CLEANED", actor=req.technician, reason="Optical window cleaned.")
    return dict(ok=ok, message=msg)


class TaskReq(BaseModel):
    station_id: str
    kind: str = "CUSTOM"
    title: Optional[str] = None
    due_ms: Optional[int] = None          # platform clock; defaults to now
    created_by: str = "LGU operator"


class DoneReq(BaseModel):
    done_by: str = "LGU field technician"
    note: str = ""


@app.get("/api/maintenance")
async def maintenance():
    return dict(now_ms=int(P.epoch() * 1000), tasks=P.schedule.view(P.epoch() * 1000))


@app.post("/api/maintenance")
async def add_task(req: TaskReq):
    try:
        t = P.add_task(req.station_id, req.kind, req.due_ms or int(P.epoch() * 1000), req.title, req.created_by)
    except KeyError:
        raise HTTPException(404, "unknown station")
    except ValueError as e:
        _400(e)
    return dict(ok=True, task=t, message=f"Reminder added: {t['title']}.")


@app.post("/api/maintenance/{task_id}/done")
async def done_task(task_id: int, req: DoneReq):
    try:
        task, nxt = P.complete_task(task_id, req.done_by, req.note)
    except KeyError:
        raise HTTPException(404, "unknown task")
    except ValueError as e:
        raise HTTPException(409, str(e))
    return dict(ok=True, task=task, next=nxt,
                message=f"Marked done: {task['title']}." + (" Next one scheduled." if nxt else ""))


class AdvisoryReq(BaseModel):
    station_ids: Optional[List[str]] = None
    message: Optional[str] = None
    sent_by: str = "LGU operator"


@app.post("/api/advisory")
async def advisory(req: AdvisoryReq):
    try:
        sent = P.send_advisory(req.station_ids, req.message, req.sent_by)
    except KeyError:
        raise HTTPException(404, "unknown station")
    except ValueError as e:
        raise HTTPException(409, str(e))
    roles = ", ".join(sorted({s["role"] for s in sent}))
    return dict(ok=True, sent=sent, message=f"SMS advisory sent to {roles}.")


@app.get("/api/trend")
async def trend(hours: float = 12, bucket_min: int = 30):
    return dict(series=P.trend(hours, bucket_min))


@app.post("/api/node/reading")
async def node_reading(body: dict, x_node_key: Optional[str] = Header(default=None)):
    """Real Wi-Fi sensor node check-in; replies with pending valve commands."""
    key = os.getenv("BULOS_NODE_KEY")
    if key and x_node_key != key:
        raise HTTPException(401, "bad node key")
    try:
        return P.ingest_node(body)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except (TypeError, ValueError) as e:
        _400(e)


class PolicyReq(BaseModel):
    auto_preempt: bool


@app.post("/api/policy")
async def policy(req: PolicyReq):
    P.twin.auto_preempt = req.auto_preempt
    return dict(auto_preempt=P.twin.auto_preempt)


class ScenarioReq(BaseModel):
    name: Literal["MONSOON", "SEPTIC", "BIOFOULING", "RESET"]


@app.post("/api/scenario")
async def scenario(req: ScenarioReq):
    try:
        P.scenario(req.name)
    except ValueError as e:
        _400(e)
    return dict(ok=True)


class SpeedReq(BaseModel):
    speed: float = Field(ge=1, le=300)


@app.post("/api/speed")
async def speed(req: SpeedReq):
    P.speed = req.speed
    return dict(speed=P.speed)


# ----------------------------------------------------------------- ingest
@app.post("/api/ingest/chirpstack")
async def ingest_chirpstack(body: dict, event: Optional[str] = "up"):
    if event != "up":
        return dict(ignored=event)
    try:
        sid, r, meta = ingest.from_chirpstack(body)
        P.ingest_reading(sid, r, meta)
    except (KeyError, ValueError) as e:
        _400(e)
    return dict(ok=True, station_id=sid)


@app.post("/api/ingest/ttn")
async def ingest_ttn(body: dict):
    try:
        sid, r, meta = ingest.from_ttn(body)
        P.ingest_reading(sid, r, meta)
    except (KeyError, ValueError) as e:
        _400(e)
    return dict(ok=True, station_id=sid)


@app.post("/api/ingest/reading")
async def ingest_reading(body: dict):
    try:
        sid, r, meta = ingest.from_generic(body)
        P.ingest_reading(sid, r, meta)
    except (KeyError, ValueError) as e:
        _400(e)
    return dict(ok=True, station_id=sid)


@app.post("/api/ingest/rainfall")
async def ingest_rainfall(body: dict):
    try:
        P.ingest_rain(body.get("gauge_id", "ext"), ingest.rain_from_body(body))
    except ValueError as e:
        _400(e)
    return dict(ok=True)
