"""
Field maintenance schedule: probe cleaning, calibration, filter and solar checks.

Times are on the platform clock (epoch ms), so in demo mode the schedule moves
at simulation speed. The twin adds an urgent lens-cleaning task by itself when
it classifies a turbidity rise as sensor biofouling; completing that task sends
the CLEANED command to the edge node.
"""
from __future__ import annotations

import itertools

DAY_MS = 86_400_000

KINDS = {
    "LENS_CLEAN": "Clean turbidity probe",
    "PH_CAL": "Calibrate pH probe",
    "FILTER": "Replace cartridge filter",
    "SOLAR": "Inspect solar panel and battery",
    "TANK": "Clean and disinfect storage tank",
    "CUSTOM": "Custom task",
}


class Schedule:
    def __init__(self, stations, now_ms):
        self._ids = itertools.count(1)
        self.tasks = []
        # staggered recurring defaults for every node, so the calendar is never empty
        for k, st in enumerate(stations):
            sid = st["id"]
            self.add(sid, "LENS_CLEAN", now_ms + (2 + 3 * k) * DAY_MS, recurring_days=14, by="schedule")
            self.add(sid, "PH_CAL", now_ms + (6 + 4 * k) * DAY_MS, recurring_days=30, by="schedule")
            if st.get("tank"):
                self.add(sid, "TANK", now_ms + (10 + 5 * k) * DAY_MS, recurring_days=90, by="schedule")
            if st["kind"] == "COMMUNAL_KIOSK":
                self.add(sid, "FILTER", now_ms + 4 * DAY_MS, recurring_days=30, by="schedule")
            if st["kind"] == "SOLAR_PUMP_WELL":
                self.add(sid, "SOLAR", now_ms + 1 * DAY_MS, recurring_days=60, by="schedule")

    def add(self, station, kind, due_ms, title=None, recurring_days=None, by="operator", urgent=False):
        if kind not in KINDS:
            raise ValueError(f"unknown task kind {kind}")
        t = dict(id=next(self._ids), station=station, kind=kind, title=title or KINDS[kind],
                 due_ms=int(due_ms), recurring_days=recurring_days, created_by=by, urgent=urgent,
                 done_ms=None, done_by=None)
        self.tasks.append(t)
        return t

    def get(self, task_id):
        for t in self.tasks:
            if t["id"] == task_id:
                return t
        raise KeyError(task_id)

    def complete(self, task_id, now_ms, by):
        t = self.get(task_id)
        if t["done_ms"]:
            raise ValueError("Task is already completed.")
        t["done_ms"], t["done_by"] = int(now_ms), by
        nxt = None
        if t["recurring_days"]:
            nxt = self.add(t["station"], t["kind"], now_ms + t["recurring_days"] * DAY_MS, t["title"],
                           t["recurring_days"], by="schedule")
        return t, nxt

    def urgent_lens_clean(self, station, now_ms):
        """Pull the next lens cleaning forward to now (or create one)."""
        for t in self.tasks:
            if t["station"] == station and t["kind"] == "LENS_CLEAN" and not t["done_ms"]:
                t["due_ms"], t["urgent"] = int(now_ms), True
                return t
        return self.add(station, "LENS_CLEAN", now_ms, by="twin", urgent=True)

    def view(self, now_ms):
        out = []
        for t in sorted(self.tasks, key=lambda x: (x["done_ms"] is not None, x["due_ms"])):
            if t["done_ms"]:
                status = "COMPLETED"
            elif t["due_ms"] < now_ms - DAY_MS / 24:
                status = "OVERDUE"
            elif t["due_ms"] < now_ms + DAY_MS:
                status = "DUE_TODAY"
            else:
                status = "UPCOMING"
            out.append(dict(t, status=status))
        return out
