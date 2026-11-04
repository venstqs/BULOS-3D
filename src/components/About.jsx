import {
  Activity, Building2, Cpu, Database, Droplets, FlaskConical, HeartPulse, Map as MapIcon, Mountain, Radio,
  ServerCog, Users, Waves, Wrench,
} from 'lucide-react';
import { usePoll } from '../api';

const FEATURES = [
  {
    title: 'CesiumJS rural & watershed catchment mapping',
    paper: 'Isolated watersheds, remote river basins and dispersed water access points draped over real terrain.',
    here: 'CesiumJS globe on real 3D terrain and satellite imagery. The watershed boundary, streams and 28 km main river are computed from the Copernicus 90 m elevation model.',
    page: 'map', Icon: Mountain,
  },
  {
    title: 'Real-time spatiotemporal contaminant heatmaps',
    paper: 'Colour-coded heatmaps of multi-parameter safety indexes (pH, turbidity, biological indicators) across kiosks and wells.',
    here: 'Choose overall risk, turbidity, pH, TDS or the biological indicator. The map spreads each reading along the river and over the hillslopes, refreshed every few seconds.',
    page: 'map', Icon: MapIcon,
  },
  {
    title: 'Decentralized hydraulic flow speed & velocity simulation',
    paper: 'Animated particle flows in gravity-fed pipes and open spring channels, driven by remote sensor telemetry.',
    here: 'River speed from slope and rainfall (Manning), gravity-pipe flow from elevation head (Hazen–Williams). Pipe flow stops when telemetry reports an empty tank, and river speeds are re-tuned from measured pulse travel times.',
    page: 'flow', Icon: Waves,
  },
  {
    title: 'Multi-parameter contaminant dispersion & predictive forecasting',
    paper: 'How runoff or biological contaminants move through rural networks and aquifers, with arrival times hours ahead.',
    here: 'An advection–dispersion model of the river plus a riverbank-aquifer model for the shallow well forecasts arrival, peak and clearing times 4 hours ahead. It sends SMS advisories and can close intakes before the water arrives.',
    page: 'flow', Icon: Activity,
  },
  {
    title: 'Immersive rural asset inspection & health indexing',
    paper: 'Click a solar pump, storage tank or communal spring for an isometric Three.js view with a health index and live gauges.',
    here: 'Click any water point on the 3D map to open its isometric Three.js model (spring box, solar-pumped well, kiosk tank) with the 0–100 Water Quality Health Index and live gauges.',
    page: 'points', Icon: FlaskConical,
  },
];

const STACK = [
  ['Frontend & 3D/GIS', 'React, Tailwind CSS, CesiumJS, Three.js / React Three Fiber', MapIcon],
  ['Backend & processing', 'Python FastAPI; forecasts in-process or on a Celery worker', ServerCog],
  ['Time-series storage', 'PostgreSQL + TimescaleDB (SQLite for laptop demos)', Database],
  ['Field hardware', 'Low-cost ESP32 nodes over Wi-Fi, LoRaWAN or MQTT, with one biological (TLF) sensor shared at an upstream sentinel', Cpu],
];

const BENEFICIARIES = [
  ['Rural health units & sanitation workers', 'Real-time heatmaps and alerts remove blind spots and cut response time.', HeartPulse],
  ['Isolated village residents', 'Automatic contamination alerts by SMS, and intakes closed before polluted water arrives.', Users],
  ['Municipal engineers & planners', 'Flow and velocity simulation to plan pipelines, filters and intake placement.', Wrench],
  ['Local government administrators', 'Verifiable PNSDW 2017 compliance logs from the time-series archive.', Building2],
];

const SDGS = [
  ['3', 'Good health and well-being', 'Prevents waterborne disease outbreaks through real-time health indexing.', '#4c9f38'],
  ['6', 'Clean water and sanitation', 'Safely manages decentralized supplies across isolated catchments.', '#26bde2'],
  ['9', 'Industry, innovation and infrastructure', 'Brings digital twins and low-cost IoT to neglected rural infrastructure.', '#fd6925'],
  ['11', 'Sustainable cities and communities', 'Strengthens disaster recovery for isolated barangays.', '#fd9d24'],
  ['13', 'Climate action', 'Links extreme-rainfall telemetry to runoff forecasts and protective action.', '#3f7e44'],
];

const PLAN = { full: 'Biological sensor everywhere', sentinel: 'One sentinel + low-cost nodes', low_cost: 'No biological sensor' };

function Results() {
  const { data } = usePoll('/api/evaluation', 0);
  if (!data?.cases) return null;
  const rows = Object.values(data.cases).filter((c) => c.mode === 'full_twin');
  return (
    <Card>
      <h2 className="font-display text-lg font-semibold">Simulation test results</h2>
      <p className="mt-1 text-sm text-ink-2">
        {data.runs_per_case} randomised runs per case. These are simulated results, not field measurements. Without protection, 0% of contaminated water is blocked.
      </p>
      <div className="tile mt-4 overflow-x-auto">
        <table className="data">
          <thead><tr><th>Event</th><th>Sensor plan</th><th>Contaminated minutes blocked</th><th>Closed before arrival</th><th>Median warning</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={`${c.label}-${c.sensors}`}>
                <td>{c.label}</td><td>{PLAN[c.sensors] ?? c.sensors}</td><td className="num">{c.blocked_pct}%</td>
                <td className="num">{c.closed_before_arrival_pct}%</td>
                <td className="num">{c.median_lead_min == null ? 'n/a' : `${c.median_lead_min} min`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Card({ children, className = '' }) {
  return <section className={`glass p-6 ${className}`}>{children}</section>;
}

export default function AboutPage({ live, staticData, go }) {
  const people = live?.stations.reduce((a, s) => a + (s.population || 0), 0);
  return (
    <div className="mx-auto grid max-w-[1180px] gap-5">
      <Card className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
        <img src="/favicon.svg" alt="" className="h-24 w-24" />
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight">Bulos 3D: Water Quality Digital Twin</h1>
          <p className="mt-1 text-ink-2">Spatial telemetry and hydrodynamic simulation platform for rural and isolated water networks.</p>
          <p className="mt-3 max-w-[75ch] text-sm leading-relaxed text-ink-2">
            Pilot: {staticData?.site.title ?? 'Naga City, Camarines Sur'}, along {staticData?.site.subtitle ?? 'Mt. Isarog to Naga City'}.
            {people ? ` ${live.stations.length} water points serving about ${people.toLocaleString()} people.` : ''} Built for the Xylem Global
            Student Innovation Challenge by Camarines Sur National High School.
          </p>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold">The problem</h2>
          <ul className="mt-3 grid gap-3 text-sm leading-relaxed text-ink-2">
            <li><b className="text-ink">Off-grid telemetry gaps.</b> Remote areas rely on infrequent manual tests, so outbreaks are found late.</li>
            <li><b className="text-ink">Decentralized water vulnerability.</b> Shallow wells, communal springs and solar pumps have no SCADA oversight.</li>
            <li><b className="text-ink">Slow emergency response.</b> Rugged terrain and disconnected networks delay intervention.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold">Our solution</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Low-cost ESP32 sensor nodes stream readings over LoRaWAN or MQTT into a Python digital twin. The twin combines the
            telemetry with a 3D model of the watershed to show water safety, flow and contaminant movement across isolated
            districts. It warns rural health units and residents before contaminated water is dispensed.
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-lg font-semibold">The five core digital twin features</h2>
        <p className="mt-1 text-sm text-muted">Each one is live in this prototype. Open it to see it working.</p>
        <ol className="mt-4 grid gap-3">
          {FEATURES.map(({ title, paper, here, page, Icon }, i) => (
            <li key={title} className="tile grid gap-4 p-4 md:grid-cols-[48px_minmax(0,1fr)_auto] md:items-center">
              <span className="icon-tile !h-12 !w-12"><Icon size={22} /></span>
              <div className="min-w-0">
                <div className="font-semibold">{i + 1}. {title}</div>
                <p className="mt-1 text-sm text-ink-2"><span className="text-muted">Concept: </span>{paper}</p>
                <p className="mt-1 text-sm text-ink-2"><span className="text-muted">In Bulos 3D: </span>{here}</p>
              </div>
              <button onClick={() => go(page)} className="btn-ghost whitespace-nowrap">Open</button>
            </li>
          ))}
        </ol>
      </Card>

      <Results />

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold">System architecture</h2>
          <ul className="mt-3 grid gap-3">
            {STACK.map(([k, v, Icon]) => (
              <li key={k} className="flex gap-3 text-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel-2 text-civic"><Icon size={17} /></span>
                <span><b>{k}</b><span className="block text-ink-2">{v}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <Radio size={14} className="mt-0.5 shrink-0" />
            Demo mode simulates the field and sends real LoRaWAN payloads through the same ingest path as live sensors
            (ChirpStack, TTN or MQTT).
          </p>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold">Who benefits</h2>
          <ul className="mt-3 grid gap-3">
            {BENEFICIARIES.map(([k, v, Icon]) => (
              <li key={k} className="flex gap-3 text-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel-2 text-civic"><Icon size={17} /></span>
                <span><b>{k}</b><span className="block text-ink-2">{v}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-lg font-semibold">UN Sustainable Development Goals</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SDGS.map(([n, name, why, color]) => (
            <div key={n} className="tile p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg font-display text-sm font-bold text-white" style={{ background: color }}>{n}</span>
                <span className="text-sm font-semibold leading-tight">{name}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-2">{why}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Droplets size={14} /> Standards: PNSDW 2017 (DOH AO 2017-0010). Elevation: Copernicus GLO-90. Water-point locations are an illustrative pilot layout.</p>
      </Card>
    </div>
  );
}
