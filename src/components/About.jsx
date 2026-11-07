import {
  Activity, Building2, Cpu, Database, Droplets, FlaskConical, HeartPulse, Map as MapIcon, Mountain, Radio,
  ServerCog, Users, Waves, Wrench,
} from 'lucide-react';
import { usePoll } from '../api';
import TwinLoop from './TwinLoop';

const FEATURES = [
  {
    title: '3D rural and watershed catchment mapping',
    paper: 'Isolated watersheds, remote river basins and dispersed water access points draped over real terrain.',
    here: 'A 3D map on real terrain and satellite imagery. The river, roads and buildings come from OpenStreetMap, and the watershed boundary from the Copernicus 90 m elevation model. Follow a drop on the Watershed page to travel the 29.7 km river.',
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
    here: 'Open the 3D site view of any water point to walk around its model (spring box, solar well, kiosk tank) and look closely at its sensors, valve and storage, with the 0–100 Water Quality Health Index and live readings.',
    page: 'points', Icon: FlaskConical,
  },
];

const STACK = [
  ['Frontend & 3D/GIS', 'React, Tailwind CSS, MapLibre GL, Three.js', MapIcon],
  ['Backend & processing', 'Python FastAPI; forecasts in-process or on a Celery worker', ServerCog],
  ['Time-series storage', 'PostgreSQL + TimescaleDB (SQLite for laptop demos)', Database],
  ['Planned field hardware', 'Not built yet. The design uses low-cost ESP32 nodes over Wi-Fi, LoRaWAN or MQTT, with one biological (TLF) sensor shared at an upstream sentinel', Cpu],
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
    <section className="section p-5">
      <h2 className="font-display text-lg font-semibold">Simulation test results</h2>
      <p className="mt-1 text-sm text-ink-2">
        {data.runs_per_case} randomised runs per case. These are simulated results, not field measurements. Without protection, 0% of contaminated water is blocked.
      </p>
      <div className="mt-3 overflow-x-auto">
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
    </section>
  );
}

export default function AboutPage({ live, go }) {
  const people = live?.stations.reduce((a, s) => a + (s.population || 0), 0);
  return (
    <div className="about grid gap-3">
      <section className="glass grid items-center gap-6 p-7 md:grid-cols-[auto_minmax(0,1fr)]">
        <img src="/favicon.svg" alt="" className="h-24 w-24" />
        <div>
          <h2 className="font-display text-[34px] font-semibold leading-[1.1]">Know the water is safe before it reaches the tap</h2>
          <p className="mt-2 max-w-[66ch] text-[15px] leading-relaxed text-ink-2">
            Bulos 3D is a water quality digital twin for rural water networks. The pilot follows the Naga River, from the Mt. Isarog slope to Naga City,
            {people ? ` with ${live.stations.length} water points serving about ${people.toLocaleString()} people.` : '.'} Built for the Xylem Global
            Student Innovation Challenge by Camarines Sur National High School.
          </p>
          <button onClick={() => go('home')} className="btn-primary mt-3">Open the map</button>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="section p-5">
          <h2 className="font-display text-lg font-semibold">The problem</h2>
          <ul className="mt-2 grid gap-2.5 pl-0 text-sm leading-relaxed text-ink-2">
            <li className="list-none"><b className="text-ink">Testing is rare.</b> Remote areas rely on infrequent manual tests, so outbreaks are found late.</li>
            <li className="list-none"><b className="text-ink">Small systems go unwatched.</b> Shallow wells, communal springs and solar pumps have no monitoring.</li>
            <li className="list-none"><b className="text-ink">Help arrives slowly.</b> Rugged terrain and disconnected networks delay any response.</li>
          </ul>
        </section>
        <section className="section p-5">
          <h2 className="font-display text-lg font-semibold">Our solution</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            A Python digital twin combines sensor readings with a 3D model of the watershed to show water safety and how contamination moves. It warns health
            units and residents, and closes intakes, before polluted water is dispensed. Today it runs on open map and weather data with simulated sensors. Low-cost ESP32 nodes are the planned next step.
          </p>
        </section>
      </div>

      <TwinLoop live={live} />

      <section className="section" aria-label="Core features">
        <div className="section-head"><h2>The five core features</h2></div>
        <ol className="m-0 p-0">
          {FEATURES.map(({ title, here, page, Icon }) => (
            <li key={title} className="flex list-none items-center gap-3 border-t border-line px-4 py-3">
              <Icon size={20} className="shrink-0 text-civic" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{title}</div>
                <p className="mt-0.5 max-w-[80ch] text-[13px] leading-relaxed text-ink-2">{here}</p>
              </div>
              <button onClick={() => go(page)} className="btn-ghost shrink-0 !py-1.5">Open</button>
            </li>
          ))}
        </ol>
      </section>

      <Results />

      <div className="grid gap-3 md:grid-cols-2">
        <section className="section p-5">
          <h2 className="font-display text-lg font-semibold">How it is built</h2>
          <ul className="mt-2 grid gap-2.5 pl-0">
            {STACK.map(([k, v, Icon]) => (
              <li key={k} className="flex list-none gap-2.5 text-sm">
                <Icon size={17} className="mt-0.5 shrink-0 text-civic" />
                <span><b>{k}</b><span className="block text-ink-2">{v}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <Radio size={14} className="mt-0.5 shrink-0" />
            Demo mode simulates the field and sends real LoRaWAN payloads through the same path as live sensors.
          </p>
        </section>
        <section className="section p-5">
          <h2 className="font-display text-lg font-semibold">Who benefits</h2>
          <ul className="mt-2 grid gap-2.5 pl-0">
            {BENEFICIARIES.map(([k, v, Icon]) => (
              <li key={k} className="flex list-none gap-2.5 text-sm">
                <Icon size={17} className="mt-0.5 shrink-0 text-civic" />
                <span><b>{k}</b><span className="block text-ink-2">{v}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="section p-5">
        <h2 className="font-display text-lg font-semibold">UN Sustainable Development Goals</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {SDGS.map(([n, name, why]) => (
            <div key={n}>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-civic font-display text-sm font-bold text-white">{n}</span>
                <span className="text-[13px] font-semibold leading-tight">{name}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{why}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Droplets size={14} /> Standards: PNSDW 2017 (DOH AO 2017-0010). Elevation: Copernicus GLO-90. Water-point locations are an illustrative pilot layout.</p>
      </section>
    </div>
  );
}
