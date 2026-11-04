import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, OrthographicCamera, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { X } from 'lucide-react';
import { StatusBadge } from './StationPanel';
import { CLASS_LABEL, EDGE_LABEL, fmt, notFitted, stationStatus } from '../lib/format';

/* raw-water colour from turbidity: clear blue -> sediment brown */
function waterColor(turb) {
  const t = Math.min(1, Math.max(0, (turb - 1) / 80));
  return new THREE.Color().lerpColors(new THREE.Color('#3f8fd8'), new THREE.Color('#8a5a2b'), t);
}

const STATUS_COLOR = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b', info: '#3987e5' };
const STATUS_TEXT = { good: 'within limit', warning: 'near limit', critical: 'out of limit', info: '' };

function gaugeSpecs(st) {
  const r = st.reading;
  const b = st.baseline;
  return [
    { k: 'turbidity', label: 'Turbidity', unit: 'NTU', v: r.turbidity, min: 0, max: 50, d: 1,
      s: r.turbidity <= 5 ? 'good' : r.turbidity <= 10 ? 'warning' : 'critical' },
    { k: 'orp', label: 'ORP', unit: 'mV', v: r.orp, min: 0, max: 600, d: 0,
      s: r.orp >= b.orp - 60 ? 'good' : r.orp >= b.orp - 150 ? 'warning' : 'critical' },
    { k: 'ph', label: 'pH', unit: '', v: r.ph, min: 4, max: 10, d: 2,
      s: r.ph >= 6.5 && r.ph <= 8.5 ? 'good' : r.ph >= 6 && r.ph <= 9 ? 'warning' : 'critical' },
    { k: 'tds', label: 'TDS', unit: 'mg/L', v: r.tds, min: 0, max: 1000, d: 0,
      s: r.tds <= 500 ? 'good' : r.tds <= 600 ? 'warning' : 'critical' },
    { k: 'bio', label: 'Biological', unit: 'ppb', v: r.bio ?? 0, min: 0, max: 40, d: 1,
      s: r.bio == null ? 'info' : r.bio < 5 ? 'good' : r.bio < 10 ? 'warning' : 'critical' },
    { k: 'temp', label: 'Water temp.', unit: '°C', v: r.temp, min: 15, max: 40, d: 1, s: 'info' },
    { k: 'wqhi', label: 'WQHI', unit: '/100', v: st.wqhi.score, min: 0, max: 100, d: 0,
      s: st.wqhi.score >= 80 ? 'good' : st.wqhi.score >= 60 ? 'warning' : 'critical' },
  ];
}

/** Semicircular live gauge. Status is always spelled out, never colour alone. */
function Gauge({ label, unit, v, min, max, d, s }) {
  const t = Math.min(1, Math.max(0, (v - min) / (max - min)));
  const R = 34;
  const arc = (a) => [44 + R * Math.cos(Math.PI * (1 - a)), 42 - R * Math.sin(Math.PI * (1 - a))];
  const [x1, y1] = arc(0);
  const [x2, y2] = arc(1);
  const [xv, yv] = arc(t);
  return (
    <div className="rounded-lg bg-panel-2 p-2 text-center">
      <svg width={88} height={48} className="mx-auto block">
        <path d={`M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}`} fill="none" stroke="#383835" strokeWidth={7} strokeLinecap="round" />
        {t > 0.005 && (
          <path d={`M${x1},${y1} A${R},${R} 0 0 1 ${xv},${yv}`} fill="none" stroke={STATUS_COLOR[s]} strokeWidth={7} strokeLinecap="round" />
        )}
      </svg>
      <div className="-mt-3 text-sm font-semibold tabular">{fmt(v, d)}<span className="ml-0.5 text-[10px] font-normal text-muted">{unit}</span></div>
      <div className="text-[10.5px] text-ink-2">{label}</div>
      {STATUS_TEXT[s] && <div className="text-[10px]" style={{ color: STATUS_COLOR[s] }}>{STATUS_TEXT[s]}</div>}
    </div>
  );
}

function Tag({ position, title, value, tone = '#14212b' }) {
  return (
    <Html position={position} center zIndexRange={[10, 0]}>
      <div className="pointer-events-none whitespace-nowrap rounded border border-[#d6dee5] bg-white/95 px-2 py-1 text-[11px] leading-tight shadow-sm">
        <div className="text-[#6b7a86]">{title}</div>
        <div className="font-semibold" style={{ color: tone }}>{value}</div>
      </div>
    </Html>
  );
}

/** Water droplets travelling along the intake pipe while the valve is open. */
function Flow({ open, color, from, to }) {
  const group = useRef();
  const n = 10;
  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.children.forEach((m, i) => {
      m.userData.t = ((m.userData.t ?? i / n) + (open ? dt * 0.35 : 0)) % 1;
      m.position.lerpVectors(from, to, m.userData.t);
      m.visible = open;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} /></mesh>
      ))}
    </group>
  );
}

function Beacon({ color, blink }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.emissiveIntensity = blink ? 0.4 + 1.6 * (Math.sin(clock.elapsedTime * 8) > 0 ? 1 : 0) : 1.2;
  });
  return (
    <mesh position={[0, 0.25, 0]}>
      <cylinderGeometry args={[0.16, 0.2, 0.32, 20]} />
      <meshStandardMaterial ref={ref} color={color} emissive={color} />
    </mesh>
  );
}

function Site({ st }) {
  const status = stationStatus(st);
  const water = useMemo(() => waterColor(st.reading.turbidity), [st.reading.turbidity]);
  const fouled = st.classification === 'SENSOR_BIOFOULING' || st.edge_state === 'MAINTENANCE';
  const hasValve = Boolean(st.valve);
  const open = hasValve ? st.valve.open : true;
  const tankPct = st.tank?.pct ?? 0;
  const tripped = st.edge_state === 'TRIPPED';
  const isWell = st.kind === 'SOLAR_PUMP_WELL';
  const isSpring = st.kind === 'SPRING_INTAKE';

  return (
    <group>
      {/* ground + creek */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[14, 10]} /><meshStandardMaterial color="#b8c7a6" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[-4.6, 0.01, 0]}>
        <planeGeometry args={[2.2, 10]} /><meshStandardMaterial color={water} transparent opacity={0.9} />
      </mesh>

      {/* sensor sonde in the creek */}
      <group position={[-4.6, 0, -1.2]}>
        <mesh position={[0, 0.9, 0]}><boxGeometry args={[0.12, 1.8, 0.12]} /><meshStandardMaterial color="#9a9a9a" /></mesh>
        {[[-0.18, 0], [0.18, 0], [0, 0.18], [0, -0.18]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.25, z]}>
            <cylinderGeometry args={[0.07, 0.07, 0.5, 14]} />
            <meshStandardMaterial color={i === 0 && fouled ? '#4f6b2a' : '#d6d6d6'} />
          </mesh>
        ))}
        {fouled && (
          <mesh position={[-0.18, 0.1, 0]}><sphereGeometry args={[0.13, 12, 12]} /><meshStandardMaterial color="#5d7f2c" transparent opacity={0.7} /></mesh>
        )}
        <Tag position={[0, 2.3, 0]} title="Multi-probe sonde" value={`${fmt(st.reading.turbidity, 1)} NTU · ${fmt(st.reading.orp, 0)} mV`}
             tone={fouled ? '#b07800' : '#14212b'} />
        {fouled && <Tag position={[0.2, -0.2, 1.2]} title="Optical window" value="biofilm detected" tone="#b07800" />}
      </group>

      {/* edge enclosure: ESP32 + LoRa + GSM, solar */}
      <group position={[-2.2, 0, -2.6]}>
        <mesh position={[0, 1.1, 0]}><boxGeometry args={[0.1, 2.2, 0.1]} /><meshStandardMaterial color="#777" /></mesh>
        <RoundedBox args={[0.9, 0.7, 0.35]} radius={0.05} position={[0, 1.2, 0.2]}><meshStandardMaterial color="#e8e6df" /></RoundedBox>
        <mesh position={[0, 2.35, -0.1]} rotation-x={-0.6}><boxGeometry args={[1.4, 0.05, 0.9]} /><meshStandardMaterial color="#1f3b73" metalness={0.4} roughness={0.3} /></mesh>
        <mesh position={[0.38, 1.85, 0.2]}><cylinderGeometry args={[0.025, 0.025, 0.8, 8]} /><meshStandardMaterial color="#111" /></mesh>
        <group position={[0, 2.55, 0.25]}><Beacon color={status.color} blink={tripped} /></group>
        <Tag position={[0, 3.3, 0]} title="Edge node (ESP32 · LoRaWAN · GSM)" value={st.edge_state.replaceAll('_', ' ')} tone={status.color} />
      </group>

      {isSpring && (
        <group position={[-2.6, 0, 1.2]}>
          {/* concrete spring box capturing the spring eye, overflow to the creek */}
          <mesh position={[0, 0.45, 0]}><boxGeometry args={[1.6, 0.9, 1.2]} /><meshStandardMaterial color="#9c9a92" /></mesh>
          <mesh position={[0, 0.93, 0]}><boxGeometry args={[0.6, 0.06, 0.6]} /><meshStandardMaterial color="#5b5a55" /></mesh>
          <mesh position={[-1.2, 0.3, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.08, 0.08, 1.0, 12]} /><meshStandardMaterial color="#c9c9c9" />
          </mesh>
          <Flow open color={water} from={new THREE.Vector3(-0.8, 0.3, 0)} to={new THREE.Vector3(-1.7, 0.3, 0)} />
          <Tag position={[0, 1.6, 0]} title="Communal spring box" value={`${fmt(st.reading.temp, 1)} °C · gravity line`} />
        </group>
      )}

      {isWell && (
        <group position={[-2.9, 0, 1.4]}>
          {/* riverbank shallow well: casing, wellhead, submersible solar pump below */}
          <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.45, 0.45, 0.7, 24]} /><meshStandardMaterial color="#8e8c84" /></mesh>
          <mesh position={[0, 0.78, 0]}><cylinderGeometry args={[0.18, 0.18, 0.2, 16]} /><meshStandardMaterial color="#2f5d9b" /></mesh>
          <mesh position={[0, -0.6, 0]}><cylinderGeometry args={[0.2, 0.2, 1.2, 16]} /><meshStandardMaterial color="#5c6b7a" transparent opacity={0.5} /></mesh>
          <Tag position={[0, 1.5, 0]} title="Shallow well + solar pump" value={open ? 'pumping' : 'pump disabled'} tone={open ? '#0ca30c' : '#d03b3b'} />
        </group>
      )}
      {isWell && (
        <group position={[0.6, 0, -2.8]}>
          {[-0.9, 0.9].map((x) => (
            <mesh key={x} position={[x, 0.9, 0]} rotation-x={-0.5}><boxGeometry args={[1.6, 0.05, 1.0]} /><meshStandardMaterial color="#1f3b73" metalness={0.4} roughness={0.3} /></mesh>
          ))}
          <mesh position={[0, 0.45, 0.2]}><boxGeometry args={[3.4, 0.08, 0.08]} /><meshStandardMaterial color="#777" /></mesh>
          <Tag position={[0, 1.8, 0]} title="Solar array (pump)" value="1.2 kWp" />
        </group>
      )}

      {hasValve && (
        <>
          {/* intake pipe from creek / well to valve to tank */}
          <mesh position={[isWell ? -1.35 : -2.2, 0.35, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.12, 0.12, isWell ? 3.1 : 4.4, 16]} /><meshStandardMaterial color="#c9c9c9" metalness={0.5} roughness={0.4} />
          </mesh>
          {isWell && (
            <mesh position={[-2.9, 0.55, 0.7]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.1, 0.1, 1.4, 12]} /><meshStandardMaterial color="#c9c9c9" />
            </mesh>
          )}
          <Flow open={open} color={water} from={new THREE.Vector3(isWell ? -2.9 : -4.3, 0.35, 0)} to={new THREE.Vector3(0.2, 0.35, 0)} />
          {/* solenoid valve */}
          <group position={[-1.2, 0.35, 0]}>
            <mesh><boxGeometry args={[0.55, 0.45, 0.45]} /><meshStandardMaterial color={open ? '#0ca30c' : '#d03b3b'} /></mesh>
            <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.15, 0.15, 0.4, 16]} /><meshStandardMaterial color="#333" /></mesh>
            <Tag position={[0, 1.15, 0]} title={st.valve.model} value={open ? 'OPEN' : 'CLOSED'} tone={open ? '#0ca30c' : '#d03b3b'} />
          </group>
          {/* cartridge filter */}
          <mesh position={[0.2, 0.6, 0]}><cylinderGeometry args={[0.28, 0.28, 1.1, 20]} /><meshStandardMaterial color="#4a6fa5" /></mesh>
        </>
      )}

      {st.tank && (
        <group position={[2.6, isWell ? 1.6 : 0, 0]}>
          {isWell && [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, -0.8, z]}><boxGeometry args={[0.12, 1.6, 0.12]} /><meshStandardMaterial color="#6b6b6b" /></mesh>
          ))}
          {isWell && (
            <mesh position={[-1.6, -0.6, 0]}><boxGeometry args={[0.18, 2.0, 0.18]} /><meshStandardMaterial color="#c9c9c9" /></mesh>
          )}
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[1.3, 1.3, 2.8, 40, 1, true]} />
            <meshStandardMaterial color="#9fb7cc" transparent opacity={0.25} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, (2.8 * tankPct) / 200, 0]}>
            <cylinderGeometry args={[1.25, 1.25, Math.max(0.02, (2.8 * tankPct) / 100), 40]} />
            <meshStandardMaterial color="#3f8fd8" transparent opacity={0.85} />
          </mesh>
          <Tag position={[0, 3.3, 0]} title={isWell ? 'Elevated storage tank' : 'Storage tank'}
               value={`${fmt(tankPct, 0)}% · ${fmt(st.tank.reserve_h, 1)} h reserve`} />
          {/* taps */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[2.0, isWell ? -1.0 : 0.6, -0.8 + i * 0.8]}><boxGeometry args={[0.18, 1.2, 0.18]} /><meshStandardMaterial color="#888" /></mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** The isometric 3D site model; also embedded by the mobile app (?embed=site). */
export function SiteScene({ st, zoom = 54 }) {
  return (
    <Canvas shadows>
      <OrthographicCamera makeDefault position={[10, 9, 10]} zoom={zoom} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 10, 4]} intensity={1.6} castShadow />
      <Site st={st} />
      <OrbitControls enablePan={false} minZoom={20} maxZoom={140} maxPolarAngle={Math.PI / 2.3} target={[0, 0.8, 0]} />
    </Canvas>
  );
}

export default function AssetInspector({ st, onClose }) {
  if (!st) return null;
  const status = stationStatus(st);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#14212b]/50 p-6" onClick={onClose}>
      <div className="flex h-[78vh] w-[min(1200px,94vw)] overflow-hidden rounded-lg border border-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex-1 bg-[#eef2f0]">
          <SiteScene st={st} />
          <div className="absolute left-3 top-3 text-[11px] text-muted">Isometric diagnostic view · drag to orbit · scroll to zoom</div>
        </div>
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line p-4 text-xs">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-muted">{st.id}</div>
              <h2 className="text-base font-semibold">{st.name}</h2>
            </div>
            <button onClick={onClose} className="rounded p-1 text-muted hover:text-ink" aria-label="Close"><X size={16} /></button>
          </div>
          <div className="mt-2"><StatusBadge status={status} /></div>
          <dl className="mt-3 grid grid-cols-2 gap-y-1.5">
            <dt className="text-muted">Classification</dt><dd>{CLASS_LABEL[st.classification]}</dd>
            <dt className="text-muted">Edge state</dt><dd>{EDGE_LABEL[st.edge_state]}</dd>
            <dt className="text-muted">WQHI</dt><dd className="tabular">{st.wqhi.score} / 100</dd>
            <dt className="text-muted">Surrogate risk</dt><dd className="tabular">{fmt(st.risk, 2)}</dd>
          </dl>
          <h3 className="mt-4 font-display text-[13px] font-semibold text-ink">Live telemetry</h3>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {gaugeSpecs(st).filter((g) => !notFitted(st, g.k)).map((g) => <Gauge key={g.k} {...g} />)}
          </div>
          <h3 className="mt-4 font-display text-[13px] font-semibold text-ink">WQHI sub-scores</h3>
          <div className="mt-1.5 space-y-1.5">
            {Object.entries(st.wqhi.parts).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-16 text-ink-2">{k}</span>
                <div className="h-1.5 flex-1 rounded-full bg-panel-2"><div className="h-full rounded-full bg-accent" style={{ width: `${v}%` }} /></div>
                <span className="w-7 text-right tabular">{v}</span>
              </div>
            ))}
          </div>
          <h3 className="mt-4 font-display text-[13px] font-semibold text-ink">Drift diagnostics (90 min window)</h3>
          {st.drift ? (
            <dl className="mt-1.5 grid grid-cols-2 gap-y-1 tabular">
              <dt className="text-muted">Turbidity slope</dt><dd>{fmt(st.drift.slope_ntu_per_min * 60, 2)} NTU/h</dd>
              <dt className="text-muted">Linearity R²</dt><dd>{st.drift.r2}</dd>
              <dt className="text-muted">ORP deviation</dt><dd>±{st.drift.orp_dev} mV</dd>
              <dt className="text-muted">TDS deviation</dt><dd>±{st.drift.tds_dev} mg/L</dd>
            </dl>
          ) : <div className="mt-1 text-muted">Not enough history yet.</div>}
          <p className="mt-2 leading-relaxed text-muted">
            Biofilm only affects the optical turbidity channel. A slow, linear rise with flat ORP/TDS, no rain and a quiet
            upstream node is flagged for cleaning instead of shutting off water for the community.
          </p>
        </aside>
      </div>
    </div>
  );
}
