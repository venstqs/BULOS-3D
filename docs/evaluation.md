# Bulos 3D simulation test results

**These are simulated results from the virtual field, not field measurements.**
2 randomised runs per case at Naga City, Camarines Sur. Event size, duration and sensor noise change every run.
"Contaminated" comes from the simulator's true water, which the twin never sees.
Low-cost set means no biological sensor. With no protection at all, 0% of contaminated minutes are blocked.

| Event | Sensors | Protection | Contaminated minutes blocked | Closed before arrival | Warned | Median warning | Median ETA error |
|---|---|---|---|---|---|---|---|
| Piggery lagoon spill | Full set | Edge only | 94.6% | 0.0% | 100.0% | 78.0 min | 5.5 min |
| Piggery lagoon spill | Full set | Full twin | 98.6% | 83.3% | 100.0% | 78.0 min | 5.5 min |
| Piggery lagoon spill | Low-cost set | Edge only | 51.4% | 0.0% | 33.3% | 58.0 min | 2.0 min |
| Piggery lagoon spill | Low-cost set | Full twin | 54.4% | 33.3% | 33.3% | 58.0 min | 2.0 min |
| Monsoon cloudburst | Full set | Edge only | 82.3% | 0.0% | 100.0% | 39.0 min | 6.5 min |
| Monsoon cloudburst | Full set | Full twin | 94.2% | 83.3% | 100.0% | 39.0 min | 6.5 min |
| Monsoon cloudburst | Low-cost set | Edge only | 82.1% | 0.0% | 83.3% | 38.0 min | 8.0 min |
| Monsoon cloudburst | Low-cost set | Full twin | 94.3% | 83.3% | 83.3% | 38.0 min | 8.0 min |

## False alarms

| Sensors | Dirty-sensor runs | Wrongly shut | Correctly identified | Quiet 12 h runs | Wrongly shut | False advisories |
|---|---|---|---|---|---|---|
| Full set | 2 | 0 | 2 | 2 | 0 | 0 |
| Low-cost set | 2 | 0 | 2 | 2 | 0 | 0 |

Reproduce with `python -m backend.tools.evaluate`.
