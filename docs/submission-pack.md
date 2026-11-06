# Bulos 3D submission pack

**Deadline: Friday, Nov 20, 2026, 1:00 PM PT = Saturday, Nov 21, 5:00 AM Philippine time.** Late entries are not accepted.
Aim to submit by Nov 19.

## 1. Decide and do first

- [ ] Read the **Official Rules** on the challenge site. Video length and required files were not on the main page.
- [ ] Enter **Challenge #2: Water Quality**, **High School track**. Teams can have up to 5 students aged 13–25.
- [ ] Anyone under 18: submit the **Parent/Guardian Consent & Release form**, or the team is disqualified.
- [ ] Order the bench node parts today (`docs/bench-node.md`).

Judging: **Impact**, **Challenge Fit & Feasibility**, **Innovation**.

## 2. One-line pitch

> A river-wide early warning for rural water: one shared lab-grade sensor upstream and low-cost nodes at every
> water point, joined by a digital twin that closes intakes before contaminated water arrives.

### What is real and what is simulated

Be exact about this. Judges will ask, and the twin has a "What is real here" panel on the map.

- **Real:** Copernicus elevation, Esri satellite imagery, OpenStreetMap river, streams, roads, buildings and Metropolitan Naga Water District facility locations, and live Open-Meteo weather.
- **Computed by the twin:** river speed and travel time, well exposure and runoff layers, forecasts and risk scores.
- **Simulated:** every sensor reading at the five water points, spills, storms, valves, tanks and SMS.
- **Illustrative:** the five water points are a proposed layout, and pipelines are proposed routes along real roads. No real pipe data was used.

### What we mean by "digital twin"

> A digital twin is a virtual copy of a real system that stays in step with it through live data, uses physics to
> predict what happens next, and sends decisions back to change the real system. A 3D map alone is not a twin.

Bulos 3D runs this loop: **Sense → Sync → Simulate → Decide → Act**. Academic work separates a *digital model* (no
live link), a *digital shadow* (data flows in only) and a *digital twin* (data flows both ways). Be exact when judges
ask: the two-way loop runs against a simulated field that sends real-format packets. The real-node path has only been
tested with a software stand-in until a physical node is connected.

Design references: the 3D-plus-time view and layer catalogue of spatial twins such as the NSW Spatial Digital Twin, and
the community hazard mapping style of Project NOAH, applied here to water quality. Bulos 3D is not affiliated with either
project.

## 3. Changes to make in the concept paper

| Section | Old wording | New wording |
|---|---|---|
| Title / location | Generic rural networks | Name the pilot: Naga River system, Mt. Isarog to Naga City, Camarines Sur |
| Solution | Sensors at every point | **Sentinel-and-spoke network:** one biological sensor at an upstream sentinel, low-cost nodes elsewhere, the twin carrying the signal downstream |
| Hardware | "pH, turbidity, TDS, and biological indicators" at each node | Three tiers (section 5). Biological indicator = tryptophan-like fluorescence at the sentinel |
| Connectivity | LoRaWAN or MQTT | Add Wi-Fi for the bench prototype. Field nodes use LoRaWAN, plus GSM SMS as backup |
| Feature 3 | Particle flows | Add that river speeds self-correct from measured pulse travel times |
| Feature 4 | "Exact arrival times" | **Change to "arrival windows".** Simulated median error is 7.5–17 min for spills, so "exact" is not defensible |
| Feature 5 | Click for 3D view | Add dirty-sensor detection, which keeps water flowing when a probe is fouled |
| New: safety | Not covered | Normally-closed valves fail safe. Nodes decide on their own with no internet. Re-arm is refused while water is dirty |
| New: validation | Not covered | Add the results in section 4, labelled as simulation |
| Backend | "FastAPI / Celery" | Keep, with Celery as optional for scale |
| Beneficiaries | As written | Add a line on stored-water reserves so closing an intake does not leave people without water |

## 4. Results you can claim

All are **simulated**, from 12 randomised runs per case. Say "in simulation" every time. Full table: `docs/evaluation.md`.

| Event, recommended plan (sentinel + low-cost nodes) | Contaminated minutes blocked | Closed before arrival |
|---|---|---|
| Piggery lagoon spill | 93.1% | 91.7% |
| Monsoon cloudburst | 97.8% | 95.8% |

- The twin is what makes cheap sensors work: for spills, the same sensors block **51.1%** with node-only protection and **93.1%** with the twin.
- The sentinel plan comes close to a biological sensor at every site (98.7%), with one sensor instead of five.
- Without any biological sensor, spill blocking is only **58.9%**.
- Median spill warning: **99 minutes** ahead, with a median arrival-time error of 24 minutes.
- Monsoon warning is shorter: a median of **19 minutes**, because rain reaches the whole river quickly.
- The twin runs on the real Naga River (OpenStreetMap, 29.7 km), with elevation from the Copernicus 90 m model.
- **0 false shut-offs** in 36 quiet runs and 36 dirty-sensor runs; all 36 dirty sensors were correctly identified.

**Be upfront about:**
- In the sentinel spill case, 5 of 36 intake events never closed. Monsoon: 5 of 33.
- The simulator and twin share the same type of model, so field results will be worse.
- Risk weights are expert estimates. They have not been fitted to lab *E. coli* tests.
- The water points are an illustrative layout. The terrain and river are real elevation data.

## 5. Feasibility: hardware tiers

Costs are rough estimates to confirm with real quotes.

| Tier | What | Where | Rough cost |
|---|---|---|---|
| 1. Bench prototype | ESP32, turbidity, TDS, temperature, relay valve, Wi-Fi | School demo | ₱2,100–4,000 |
| 2. Field node | Adds a sealed enclosure, solar power, LoRaWAN, GSM, better probes | Each kiosk, spring, well | Get a quote; design target is well under commercial sondes |
| 3. Sentinel | Tier 2 plus a tryptophan-fluorescence sensor or an existing government sonde | One per river | Largest cost. Get a vendor quote; a Xylem/YSI partnership is the natural path |

**Rollout:** (1) bench prototype, (2) lab comparison against *E. coli* tests, (3) one barangay pilot with the health office
and water association, (4) add rivers by loading new elevation data; the software needs a config change rather than a rewrite.

## 6. Impact facts

Use these only with their source, and re-check them first.

- WHO/UNICEF JMP data reported about **34.5% of rural Filipinos** had safely managed drinking water in 2020, against about 61.8% urban ([Inquirer](https://newsinfo.inquirer.net/1571397/world-water-day-water-and-sanitation-in-ph)). The article's national figure looks inconsistent, so take current figures from [washdata.org](https://washdata.org).
- Naga's land use plan reportedly names springs in Pili plus deep wells as the main source, and only half of 22 stations met the dissolved-oxygen minimum in 2014–15 ([CLUP](https://www2.naga.gov.ph/wp-content/uploads/2023/02/Executive-Summary-CLUP-2016-30-FINAL-23November2022.pdf)). **Check this directly: it came from a search summary.**
- Still needed: recent diarrhea or typhoid figures from the City Health Office, and a named community to serve.

A quote or short letter from a barangay health worker, the City Health Office or Metro Naga Water District would add more than any new feature.

## 7. Video script (about 3 minutes; match the Official Rules)

| Time | Show | Say |
|---|---|---|
| 0:00 | Naga River, a kiosk or spring | "In the Philippines, about one in three rural residents had safely managed drinking water in 2020. When a river is contaminated, the first warning is often people getting sick." |
| 0:20 | Team | "We're [names] from Camarines Sur National High School. This is Bulos 3D." |
| 0:30 | 3D map, river from Isarog to Naga | "Bulos 3D is a digital twin of a real watershed, built from satellite elevation data. It knows how fast water moves and where it goes." |
| 0:50 | Sentinel diagram | "Biological sensors are too expensive for every barangay. So we use one upstream, and cheap nodes everywhere else. The twin connects them." |
| 1:05 | Drag the time bar: replay, then forecast | "This is what makes it a twin, not a map. It remembers the last six hours and runs the river forward four hours." |
| 1:10 | Simulate spill; AG-02 alert, ETA, SMS | "A piggery lagoon fails. The sentinel sees it. Before the plume reaches the kiosk, the twin predicts its arrival, warns the health worker and closes the intake." |
| 1:45 | **Real bench node:** add soil, LED, valve closes, dashboard reacts | "This is real hardware. Dirty water, and the valve closes by itself, even with no internet." |
| 2:10 | Dirty-sensor case | "A dirty probe looks like pollution. Bulos 3D tells them apart, so nobody loses water because of a false alarm." |
| 2:25 | Results table | "In simulation, this affordable design blocked 93% of contaminated water time from a spill, with no false shut-offs in our tests. Next, we test against lab samples." |
| 2:45 | Phone app, rollout | "It runs on a phone, and a new river is a configuration change. Water safety shouldn't depend on being near a city." |

## 8. Put it online

Judging runs about Nov 23 – Dec 9, so judges need a link that works without your PC.

1. Merge this branch and push to GitHub.
2. **Render:** create a Blueprint from the repo (`render.yaml`). Add the variable `BULOS_NODE_KEY` so strangers cannot post fake sensor data.
3. **Vercel:** import the repo and set `VITE_API` to your Render address, for example `https://bulos-3d-api.onrender.com`. Redeploy.
4. **Mobile:** in Settings, enter both addresses, or set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` in `mobile/.env`.
5. Open the site a minute before showing it. Free hosting sleeps, and the page says "Waking up" while it starts.

Anyone with the link can press the simulated valves. That is fine for a demo, but it needs real logins before any field use.

## 9. Final checklist

- [ ] Rules read, track and challenge chosen, consent forms in
- [ ] Bench node works on camera
- [ ] Concept paper updated (section 3)
- [ ] Impact facts verified, with sources
- [ ] Video recorded and within the limit
- [ ] Live link tested on another device and on mobile data
- [ ] Submitted by Nov 19
