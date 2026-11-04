"""
Pretend to be the real bench node, for rehearsing the demo before the hardware works.
Behaves like firmware/bulos_bench_node: clean water, then dirty water, trips on its
own after the persistence time, and obeys valve commands from the dashboard.

    python -m backend.tools.fake_node                     # http://127.0.0.1:8000, KS-03
    python -m backend.tools.fake_node --server http://192.168.0.12:8000 --clean 20 --dirty 40
"""
from __future__ import annotations

import argparse
import json
import random
import time
import urllib.request

PERSISTENCE_S = 15.0


class FakeNode:
    def __init__(self):
        self.state = "NORMAL"
        self.since = None

    @property
    def valve_open(self):
        return self.state in ("NORMAL", "SUSPECT")

    def step(self, turb, now):
        if not self.valve_open:
            return
        if turb < 15:
            self.state = "NORMAL"
        elif self.state != "SUSPECT":
            self.state, self.since = "SUSPECT", now
        elif turb > 30 and now - self.since >= PERSISTENCE_S:
            self.state = "TRIPPED"

    def command(self, name, turb):
        if name == "SHUT":
            self.state = "REMOTE_SHUT"
        elif name == "PREEMPT_SHUT":
            self.state = "PREEMPTIVE_SHUT"
        elif name == "FORCE_REARM" or (name == "REARM" and turb < 15):
            self.state = "NORMAL"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="http://127.0.0.1:8000")
    ap.add_argument("--station", default="KS-03")
    ap.add_argument("--clean", type=float, default=20, help="seconds of clean water first")
    ap.add_argument("--dirty", type=float, default=45, help="seconds of dirty water")
    ap.add_argument("--after", type=float, default=30, help="seconds of clean water afterwards")
    a = ap.parse_args()
    node, t0 = FakeNode(), time.time()
    while (t := time.time() - t0) < a.clean + a.dirty + a.after:
        dirty = a.clean <= t < a.clean + a.dirty
        turb = (60 if dirty else 4) + random.gauss(0, 0.5)
        node.step(turb, t)
        body = dict(station_id=a.station, turbidity=round(turb, 1), tds=round(170 + (40 if dirty else 0) + random.gauss(0, 2)),
                    temp=25.1, edge_state=node.state, valve_open=node.valve_open, rssi=-55)
        req = urllib.request.Request(f"{a.server}/api/node/reading", json.dumps(body).encode(),
                                     {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            res = json.load(r)
        for c in res["commands"]:
            print("  command from dashboard:", c["cmd"])
            node.command(c["cmd"], turb)
        print(f"{t:5.0f} s  {'DIRTY' if dirty else 'clean'}  turbidity {turb:5.1f}  {node.state}")
        time.sleep(3)


if __name__ == "__main__":
    main()
