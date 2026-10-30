"""
Time-series archive and compliance audit.

DATABASE_URL=sqlite:///backend/data/bulos.db           (default, zero setup)
DATABASE_URL=postgresql+psycopg://user:pw@host/bulos     (TimescaleDB: hypertables are
                                                          created automatically when the
                                                          extension is available)
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path

from sqlalchemy import (Boolean, Column, DateTime, Float, Integer, MetaData, String, Table, Text,
                        create_engine, func, insert, select, text)

from . import config as C

meta = MetaData()

readings = Table(
    "readings", meta,
    Column("time", DateTime(timezone=True), nullable=False, index=True),
    Column("station_id", String(16), nullable=False, index=True),
    Column("turbidity_ntu", Float), Column("orp_mv", Float), Column("ph", Float),
    Column("tds_mgl", Float), Column("temp_c", Float), Column("bio_ppb", Float),
    Column("risk", Float), Column("wqhi", Integer), Column("classification", String(24)),
    Column("edge_state", String(20)), Column("valve_open", Boolean), Column("source", String(24)),
)

rainfall = Table(
    "rainfall", meta,
    Column("time", DateTime(timezone=True), nullable=False, index=True),
    Column("gauge_id", String(16)), Column("rain_mm_hr", Float),
)

events = Table(
    "events", meta,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("time", DateTime(timezone=True), nullable=False, index=True),
    Column("station_id", String(16)), Column("type", String(32)), Column("severity", String(12)),
    Column("message", Text), Column("sms_to", String(64)), Column("actor", String(64)),
)

calibrations = Table(
    "calibrations", meta,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("time", DateTime(timezone=True), nullable=False),
    Column("station_id", String(16)), Column("kind", String(32)),     # LENS_CLEAN | TRANSIT | PROBE_CAL
    Column("detail", Text),
)


class Store:
    def __init__(self, url=C.DATABASE_URL):
        if url.startswith("sqlite:///"):
            Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(url, future=True)
        self.dialect = self.engine.dialect.name
        meta.create_all(self.engine)
        self._migrate()
        self.timescale = False
        if self.dialect == "postgresql":
            with self.engine.begin() as c:
                try:
                    c.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
                    for t in ("readings", "rainfall"):
                        c.execute(text(f"SELECT create_hypertable('{t}', 'time', if_not_exists => TRUE, "
                                       "migrate_data => TRUE)"))
                    self.timescale = True
                except Exception:
                    pass
        self._buf_r, self._buf_rain = [], []

    def _migrate(self):
        """Add columns introduced after a database was first created."""
        from sqlalchemy import inspect
        cols = {c["name"] for c in inspect(self.engine).get_columns("readings")}
        if "bio_ppb" not in cols:
            with self.engine.begin() as c:
                c.execute(text("ALTER TABLE readings ADD COLUMN bio_ppb FLOAT"))

    @staticmethod
    def ts(epoch_s):
        return dt.datetime.fromtimestamp(epoch_s, dt.timezone.utc)

    def add_reading(self, epoch_s, sid, r, st_view, source):
        self._buf_r.append(dict(
            time=self.ts(epoch_s), station_id=sid, turbidity_ntu=r["turbidity"], orp_mv=r["orp"],
            ph=r["ph"], tds_mgl=r["tds"], temp_c=r["temp"], bio_ppb=r.get("bio"), risk=st_view["risk"],
            wqhi=st_view["wqhi"]["score"], classification=st_view["classification"],
            edge_state=st_view["edge_state"], valve_open=(st_view["valve"] or {}).get("open"), source=source))

    def add_rain(self, epoch_s, gauge, mm_hr):
        self._buf_rain.append(dict(time=self.ts(epoch_s), gauge_id=gauge, rain_mm_hr=mm_hr))

    def add_event(self, epoch_s, ev, actor="twin"):
        with self.engine.begin() as c:
            c.execute(insert(events).values(
                time=self.ts(epoch_s), station_id=ev.get("station"), type=ev["type"],
                severity=ev["severity"], message=ev["message"], sms_to=ev.get("sms_to"), actor=actor))

    def add_calibration(self, epoch_s, sid, kind, detail):
        with self.engine.begin() as c:
            c.execute(insert(calibrations).values(time=self.ts(epoch_s), station_id=sid, kind=kind, detail=detail))

    def flush(self):
        if not (self._buf_r or self._buf_rain):
            return
        with self.engine.begin() as c:
            if self._buf_r:
                c.execute(insert(readings), self._buf_r)
            if self._buf_rain:
                c.execute(insert(rainfall), self._buf_rain)
        self._buf_r, self._buf_rain = [], []

    # ------------------------------------------------------------- reports
    def compliance(self, since_epoch):
        """Share of samples meeting PNSDW 2017 limits per station (raw intake water)."""
        p = C.PNSDW
        since = self.ts(since_epoch)
        with self.engine.connect() as c:
            rows = c.execute(select(
                readings.c.station_id,
                func.count().label("n"),
                func.sum((readings.c.turbidity_ntu <= p["turbidity_ntu"]).cast(Integer)).label("turb_ok"),
                func.sum(((readings.c.ph >= p["ph_min"]) & (readings.c.ph <= p["ph_max"])).cast(Integer)).label("ph_ok"),
                func.sum((readings.c.tds_mgl <= p["tds_mgL"]).cast(Integer)).label("tds_ok"),
                func.avg(readings.c.wqhi).label("wqhi_avg"),
                func.max(readings.c.risk).label("risk_max"),
                func.sum((readings.c.valve_open == False).cast(Integer)).label("closed"),  # noqa: E712
            ).where(readings.c.time >= since).group_by(readings.c.station_id)).all()
        out = []
        for r in rows:
            n = r.n or 1
            out.append(dict(station_id=r.station_id, samples=r.n,
                            turbidity_pct=round(100 * (r.turb_ok or 0) / n, 1),
                            ph_pct=round(100 * (r.ph_ok or 0) / n, 1),
                            tds_pct=round(100 * (r.tds_ok or 0) / n, 1),
                            wqhi_avg=round(float(r.wqhi_avg or 0), 1),
                            risk_max=round(float(r.risk_max or 0), 2),
                            intake_closed_pct=round(100 * (r.closed or 0) / n, 1)))
        return dict(standard="PNSDW 2017 (DOH AO 2017-0010)", limits=p, stations=out,
                    backend=("TimescaleDB" if self.timescale else self.dialect))

    def recent_events(self, limit=200):
        with self.engine.connect() as c:
            rows = c.execute(select(events).order_by(events.c.id.desc()).limit(limit)).mappings().all()
        return [dict(r, time=r["time"].isoformat() if r["time"] else None) for r in rows]
