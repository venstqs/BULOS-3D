"""
Simulation test harness: how well does Bulos 3D protect each intake?

    python -m backend.tools.evaluate            # 12 randomised runs per case
    python -m backend.tools.evaluate --runs 3   # quick check

Each run randomises the event (spill size and duration, rain intensity and length) and
the sensor noise. "Contaminated" is judged from the simulator's true water at the
intake, which the twin never sees. Compares three protection levels:

    none        no valves close: every contaminated minute reaches the tank
    edge only   the sensor node closes the valve once it detects contamination itself
    full twin   edge + forecast-driven closing before the plume arrives

and repeats it for three sensor plans:

    full        a biological sensor at every node (accurate, too expensive to scale)
    sentinel    ONE biological sensor at the upstream sentinel AG-02, low-cost nodes elsewhere
    low_cost    no biological sensor anywhere

These are SIMULATED results, not field results.
Writes backend/data/evaluation.json and docs/evaluation.md.
"""
from __future__ import annotations

import argparse
import json
import random
import statistics as stats
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from backend import config as C
from backend.edge import surrogate_risk
from backend.platform_core import Platform

ROOT = Path(__file__).resolve().parents[2]
INTAKES = [s["id"] for s in C.STATIONS if s["valve"]]
PLANS = dict(full=None, sentinel={"AG-02"}, low_cost=set())


def true_contaminated(p, sid):
    n = p.world.nodes[sid]
    risk, _ = surrogate_risk(p.world._truth(n), n["st"]["base"], 0.0)
    return risk >= C.RISK_SUSPECT


def inject(p, scenario, rng):
    p.scenario(scenario)
    w = p.world
    if scenario == "SEPTIC":
        t0, _, cell, rate = w.spills[-1]
        w.spills[-1] = (t0, t0 + rng.uniform(20, 45) * 60, cell, rate * rng.uniform(0.7, 1.6))
    elif scenario == "MONSOON":
        t0, _, _ = w.hyetograph[-1]
        w.hyetograph[-1] = (t0, t0 + rng.uniform(40, 90) * 60, rng.uniform(25, 60))


def one_run(args):
    scenario, seed, preempt, plan, minutes = args
    rng = random.Random(seed)
    random.seed(seed)
    p = Platform(store=False)
    p.twin.auto_preempt = preempt
    p.world.bio_stations = PLANS[plan]
    if plan != "full":
        for _ in range(30):                    # let the nodes report without the sensor first
            p.tick(60)
    inject(p, scenario, rng)
    first, exposed, contaminated = {}, dict.fromkeys(INTAKES, 0), dict.fromkeys(INTAKES, 0)
    closed_at = {}
    for _ in range(minutes):
        p.tick(60)
        for sid in INTAKES:
            bad = true_contaminated(p, sid)
            open_ = p.world.nodes[sid]["edge"].valve_open
            if not open_ and sid not in closed_at:
                closed_at[sid] = p.t
            if bad:
                first.setdefault(sid, p.t)
                contaminated[sid] += 1
                exposed[sid] += open_
    out = {}
    events = list(p.events)
    for sid in INTAKES:
        adv = next((e for e in reversed(events) if e["type"] == "FORECAST_ADVISORY" and e["station"] == sid), None)
        rec = dict(contaminated_min=contaminated[sid], exposed_min=exposed[sid], reached=sid in first,
                   closed=sid in closed_at)
        if sid in first:
            rec["closed_in_time"] = sid in closed_at and closed_at[sid] <= first[sid]
            if adv:
                rec["lead_min"] = (first[sid] - adv["t"]) / 60
                rec["eta_error_min"] = (adv["t"] + adv["arrival_s"] - first[sid]) / 60
        out[sid] = rec
    return out


def summarise(runs):
    recs = [r for run in runs for r in run.values() if r["reached"]]
    total = sum(r["contaminated_min"] for r in recs)
    exposed = sum(r["exposed_min"] for r in recs)
    leads = [r["lead_min"] for r in recs if "lead_min" in r]
    errs = [abs(r["eta_error_min"]) for r in recs if "eta_error_min" in r]
    return dict(
        intake_events=len(recs),
        contaminated_min=total,
        exposed_min=exposed,
        blocked_pct=round(100 * (1 - exposed / total), 1) if total else None,
        closed_before_arrival_pct=round(100 * sum(bool(r.get("closed_in_time")) for r in recs) / len(recs), 1) if recs else None,
        never_closed=sum(not r["closed"] for r in recs),
        warned_pct=round(100 * len(leads) / len(recs), 1) if recs else None,
        median_lead_min=round(stats.median(leads), 1) if leads else None,
        median_eta_error_min=round(stats.median(errs), 1) if errs else None,
    )


def false_alarm_run(args):
    """Biofouling and quiet dry-weather runs: any intake closure here is a false shut-off."""
    seed, plan = args
    random.seed(1000 + seed)
    p = Platform(store=False)
    p.world.bio_stations = PLANS[plan]
    p.scenario("BIOFOULING")
    closed = found = False
    for _ in range(240):
        p.tick(60)
        closed |= not p.world.nodes["KS-03"]["edge"].valve_open
        found |= p.twin.stations["KS-03"].classification == "SENSOR_BIOFOULING"
    random.seed(2000 + seed)
    q = Platform(store=False)
    q.world.bio_stations = PLANS[plan]
    quiet = False
    for _ in range(720):                       # 12 quiet hours
        q.tick(60)
        quiet |= any(not q.world.nodes[s]["edge"].valve_open for s in INTAKES)
    return closed, found, quiet, any(e["type"] == "FORECAST_ADVISORY" for e in q.events)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=12)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    n = args.runs
    t0 = time.time()
    results = {}
    cases = [("SEPTIC", "Piggery lagoon spill", 420), ("MONSOON", "Monsoon cloudburst", 360)]
    with ProcessPoolExecutor(args.workers) as pool:
        for scenario, label, minutes in cases:
            for plan in PLANS:
                for mode, preempt in (("edge_only", False), ("full_twin", True)):
                    runs = list(pool.map(one_run, [(scenario, s, preempt, plan, minutes) for s in range(n)]))
                    key = f"{scenario}/{plan}/{mode}"
                    results[key] = dict(label=label, sensors=plan, mode=mode, **summarise(runs))
                    print(key, results[key], flush=True)
        fa = {}
        for plan in PLANS:
            r = list(pool.map(false_alarm_run, [(s, plan) for s in range(n)]))
            fa[plan] = dict(runs=n, biofouling_false_shutoffs=sum(x[0] for x in r), biofouling_identified=sum(x[1] for x in r),
                            quiet_false_shutoffs=sum(x[2] for x in r), quiet_false_advisories=sum(x[3] for x in r))
    print(fa)
    out = dict(runs_per_case=n, site=C.SITE["title"], cases=results, false_alarms=fa,
               note="Simulated results from the Bulos 3D virtual field, not field measurements.")
    (ROOT / "backend/data/evaluation.json").write_text(json.dumps(out, indent=1))
    write_report(out)
    print(f"done in {time.time() - t0:.0f} s")


def write_report(o):
    head = ("| Event | Sensors | Protection | Contaminated minutes blocked | Closed before arrival | "
            "Warned | Median warning | Median ETA error |\n|---|---|---|---|---|---|---|---|\n")
    rows = ""
    names = dict(full="Biological sensor everywhere", sentinel="One sentinel + low-cost nodes", low_cost="No biological sensor")
    modes = dict(edge_only="Edge only", full_twin="Full twin")
    for c in o["cases"].values():
        lead = "n/a" if c["median_lead_min"] is None else f"{c['median_lead_min']} min"
        err = "n/a" if c["median_eta_error_min"] is None else f"{c['median_eta_error_min']} min"
        rows += (f"| {c['label']} | {names[c['sensors']]} | {modes[c['mode']]} | {c['blocked_pct']}% | "
                 f"{c['closed_before_arrival_pct']}% | {c['warned_pct']}% | {lead} | {err} |\n")
    fa_rows = "\n".join(
        f"| {names[k]} | {v['runs']} | {v['biofouling_false_shutoffs']} | {v['biofouling_identified']} | {v['runs']} | "
        f"{v['quiet_false_shutoffs']} | {v['quiet_false_advisories']} |" for k, v in o["false_alarms"].items())
    text = f"""# Bulos 3D simulation test results

**These are simulated results from the virtual field, not field measurements.**
{o['runs_per_case']} randomised runs per case at {o['site']}. Event size, duration and sensor noise change every run.
"Contaminated" comes from the simulator's true water, which the twin never sees.
With no protection at all, 0% of contaminated minutes are blocked.

{head}{rows}
## False alarms

| Sensors | Dirty-sensor runs | Wrongly shut | Correctly identified | Quiet 12 h runs | Wrongly shut | False advisories |
|---|---|---|---|---|---|---|
{fa_rows}
Reproduce with `python -m backend.tools.evaluate`.
"""
    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs/evaluation.md").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
