# Bulos 3D simulation test results

**These are simulated results from the virtual field, not field measurements.**
12 randomised runs per case at Naga City, Camarines Sur. Event size, duration and sensor noise change every run.
"Contaminated" comes from the simulator's true water, which the twin never sees.
With no protection at all, 0% of contaminated minutes are blocked.

| Event | Sensors | Protection | Contaminated minutes blocked | Closed before arrival | Warned | Median warning | Median ETA error |
|---|---|---|---|---|---|---|---|
| Piggery lagoon spill | Biological sensor everywhere | Edge only | 93.0% | 0.0% | 94.4% | 84.0 min | 9.5 min |
| Piggery lagoon spill | Biological sensor everywhere | Full twin | 98.7% | 91.7% | 94.4% | 84.0 min | 9.5 min |
| Piggery lagoon spill | One sentinel + low-cost nodes | Edge only | 51.1% | 0.0% | 91.7% | 99.0 min | 24.0 min |
| Piggery lagoon spill | One sentinel + low-cost nodes | Full twin | 93.1% | 91.7% | 91.7% | 99.0 min | 24.0 min |
| Piggery lagoon spill | No biological sensor | Edge only | 51.1% | 0.0% | 41.7% | 72.0 min | 3.0 min |
| Piggery lagoon spill | No biological sensor | Full twin | 58.9% | 41.7% | 41.7% | 72.0 min | 3.0 min |
| Monsoon cloudburst | Biological sensor everywhere | Edge only | 68.6% | 0.0% | 100.0% | 39.0 min | 8.5 min |
| Monsoon cloudburst | Biological sensor everywhere | Full twin | 100.0% | 100.0% | 100.0% | 39.0 min | 8.5 min |
| Monsoon cloudburst | One sentinel + low-cost nodes | Edge only | 67.8% | 0.0% | 95.8% | 19.0 min | 4.0 min |
| Monsoon cloudburst | One sentinel + low-cost nodes | Full twin | 97.8% | 95.8% | 95.8% | 19.0 min | 4.0 min |
| Monsoon cloudburst | No biological sensor | Edge only | 67.8% | 0.0% | 91.7% | 19.0 min | 3.5 min |
| Monsoon cloudburst | No biological sensor | Full twin | 94.8% | 91.7% | 91.7% | 19.0 min | 3.5 min |

## False alarms

| Sensors | Dirty-sensor runs | Wrongly shut | Correctly identified | Quiet 12 h runs | Wrongly shut | False advisories |
|---|---|---|---|---|---|---|
| Biological sensor everywhere | 12 | 0 | 12 | 12 | 0 | 0 |
| One sentinel + low-cost nodes | 12 | 0 | 12 | 12 | 0 | 0 |
| No biological sensor | 12 | 0 | 12 | 12 | 0 | 0 |
Reproduce with `python -m backend.tools.evaluate`.
