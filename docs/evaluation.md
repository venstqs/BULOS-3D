# Bulos 3D simulation test results

**These are simulated results from the virtual field, not field measurements.**
12 randomised runs per case at Naga City, Camarines Sur. Event size, duration and sensor noise change every run.
"Contaminated" comes from the simulator's true water, which the twin never sees.
With no protection at all, 0% of contaminated minutes are blocked.

| Event | Sensors | Protection | Contaminated minutes blocked | Closed before arrival | Warned | Median warning | Median ETA error |
|---|---|---|---|---|---|---|---|
| Piggery lagoon spill | Biological sensor everywhere | Edge only | 93.4% | 0.0% | 88.9% | 79.0 min | 7.5 min |
| Piggery lagoon spill | Biological sensor everywhere | Full twin | 98.1% | 86.1% | 88.9% | 79.0 min | 7.5 min |
| Piggery lagoon spill | One sentinel + low-cost nodes | Edge only | 49.2% | 0.0% | 86.1% | 92.0 min | 17.0 min |
| Piggery lagoon spill | One sentinel + low-cost nodes | Full twin | 88.9% | 86.1% | 86.1% | 92.0 min | 17.0 min |
| Piggery lagoon spill | No biological sensor | Edge only | 49.2% | 0.0% | 33.3% | 58.0 min | 1.0 min |
| Piggery lagoon spill | No biological sensor | Full twin | 52.6% | 33.3% | 33.3% | 58.0 min | 1.0 min |
| Monsoon cloudburst | Biological sensor everywhere | Edge only | 85.0% | 0.0% | 96.9% | 39.0 min | 6.0 min |
| Monsoon cloudburst | Biological sensor everywhere | Full twin | 96.9% | 90.6% | 96.9% | 39.0 min | 6.0 min |
| Monsoon cloudburst | One sentinel + low-cost nodes | Edge only | 82.0% | 0.0% | 93.9% | 38.0 min | 9.0 min |
| Monsoon cloudburst | One sentinel + low-cost nodes | Full twin | 95.2% | 84.8% | 93.9% | 38.0 min | 9.0 min |
| Monsoon cloudburst | No biological sensor | Edge only | 82.0% | 0.0% | 90.9% | 37.0 min | 8.5 min |
| Monsoon cloudburst | No biological sensor | Full twin | 95.2% | 84.8% | 90.9% | 37.0 min | 8.5 min |

## False alarms

| Sensors | Dirty-sensor runs | Wrongly shut | Correctly identified | Quiet 12 h runs | Wrongly shut | False advisories |
|---|---|---|---|---|---|---|
| Biological sensor everywhere | 12 | 0 | 12 | 12 | 0 | 0 |
| One sentinel + low-cost nodes | 12 | 0 | 12 | 12 | 0 | 0 |
| No biological sensor | 12 | 0 | 12 | 12 | 0 | 0 |
Reproduce with `python -m backend.tools.evaluate`.
