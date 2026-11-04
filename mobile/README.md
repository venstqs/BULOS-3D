# Bulos 3D mobile (Expo / React Native)

The Bulos 3D water quality digital twin on your phone, in the same soft-aqua design as the website.
It supports **both** standalone in-app testing and live synchronization with the data server.

## How to Test in Expo Go

### Option 1: Standalone In-App Demo (Zero setup, no PC server needed)
1. **On your PC in the `mobile/` folder:**
   ```bash
   npm start
   ```
2. **On your phone:**
   Open **Expo Go** and scan the QR code.
3. The app automatically detects if the PC data server is offline and activates the **React Native In-App Digital Twin**:
   - Live sensor telemetry (pH, turbidity, TDS, ORP, biological TLF) ticks and updates every second.
   - Interactive intake valve actuation: test **Close intake**, **Re-arm**, and **Force Re-arm**.
   - Scenario injection in **More → Simulate**: inject **Piggery lagoon spill**, **Monsoon rain**, or **Biofouling**.
   - Phone haptic vibration on danger events.
   - Interactive native 2D river schematic and site inspector views.

---

### Option 2: Live Synchronized Mode (with PC Backend)
1. **PC, project root:**
   ```bash
   npm run start:lan
   ```
   Serves the data server (port 8000) and website (port 5173) across your Wi-Fi network.
   Allow **Python** and **Node.js** on private networks if Windows Firewall prompts.
2. **PC, `mobile/` folder:**
   ```bash
   npm start
   ```
3. **Phone:**
   Connect to the **same Wi-Fi**, open **Expo Go**, and scan the QR code.
   Changes made on your phone (closing valves, triggering spills) will reflect on the desktop site simultaneously.

---

## Screens

| Tab / screen | What it does |
|---|---|
| Home | Network water quality score, selected water point, today's readings, quick actions, schedule, 12 h trend, activity feed |
| 3D map | Watershed heatmap selector (risk, turbidity, pH, TDS, biological) with 3D Cesium WebView + native 2D schematic fallback |
| Forecast | Next arrival countdown, auto-close switch, 4 h risk forecast, arrival windows, river line diagram, gravity pipelines, travel times |
| Points → detail | Live gauges, health index breakdown, dirty-sensor explanation, close / re-arm / force re-arm, tank reserve, 6 h trends |
| 3D site view | Three.js isometric model with native component inspector fallback |
| Tasks | Maintenance schedule: overdue, due today, upcoming, completed; mark done |
| More | Simulate field events, reports (PNSDW compliance, SMS, event log), about (5 features, SDGs), server settings |

Quick actions: **Water test** (shareable PNSDW report), **Add reminder**, **Log maintenance**, **Send SMS advisory**.
The phone vibrates when a new danger alert arrives.
