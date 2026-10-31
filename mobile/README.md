# Bulos 3D mobile (Expo / React Native)

The Bulos 3D water quality digital twin on your phone, in the same soft-aqua design as the website.
It uses the same live data server, so everything you do here also shows on the website.

## Run it in Expo Go

1. **PC, project root:** `npm run start:lan`
   Serves the data server (port 8000) and website (port 5173) on your Wi-Fi.
   If Windows Firewall asks, allow **Python** and **Node.js** on **private networks**.
2. **PC, this folder:** `npm install` (first time only), then `npm start`
3. **Phone:** connect to the **same Wi-Fi**, open **Expo Go** and scan the QR code.

The app finds your PC automatically from the address Expo Go loaded it from.
If it says it cannot reach the data server, open **More → Server settings**, check the address
(for example `http://192.168.0.12:8000`) and tap **Test connection**. You can also point it at a deployed
backend, such as a Render URL.

## Screens

| Tab / screen | What it does |
|---|---|
| Home | Network water quality, selected water point, today's readings, quick actions, schedule, 12 h trend, activity |
| 3D map | The CesiumJS watershed with the heatmap selector (risk, turbidity, pH, TDS, biological). Tap a water point to open it |
| Forecast | Next arrival, auto-close switch, 4 h risk forecast, arrival windows, river line diagram, gravity pipelines, travel times |
| Points → detail | Live gauges, health index breakdown, dirty-sensor explanation, close / re-arm / force re-arm, tank reserve, 6 h trends |
| 3D site view | The Three.js isometric model of the spring box, kiosk or solar well |
| Tasks | Maintenance schedule: overdue, due today, upcoming, completed; mark done |
| More | Simulate events, reports (PNSDW compliance, SMS, event log), about (5 features, SDGs), server settings |

Quick actions: **Water test** (shareable PNSDW report), **Add reminder**, **Log maintenance**, **Send SMS advisory**.
The phone vibrates when a new danger alert arrives.

## Notes

- CesiumJS and Three.js cannot run natively inside Expo Go, so the two 3D views are the website's own
  embed pages (`/?embed=map`, `/?embed=site&id=…`) in a WebView. Everything else is native.
- LAN mode exposes the data server, including valve controls, to everyone on the Wi-Fi network, with no login.
  Use it on a trusted network only.
- Built with Expo SDK 58 and Expo Router. Checked with `npx expo-doctor` (20/20), `npx expo lint`, and an
  Android export bundle (`npx expo export --platform android`).
