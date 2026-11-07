import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePoll } from './api';
import { useTwinTime } from './lib/useTwinTime';
import MapCredits from './components/MapCredits';

// Full-screen 3D views embedded by the Bulos 3D mobile app in a WebView.
//   ?embed=map&index=risk     the 3D twin (tap a water point -> app opens it)
//   ?embed=site&id=KS-03      3D site model
const TwinMapScene = lazy(() => import('./components/TwinMapScene'));
const SiteScene = lazy(() => import('./components/AssetInspector').then((m) => ({ default: m.SiteScene })));

const send = (msg) => window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
const Loading = ({ text }) => <div className="flex h-full items-center justify-center text-sm text-muted">{text}</div>;

const LAYERS = { particles: true, streams: true, pipes: true, catchment: true, buildings: true, labels: true };

/** The same 3D twin as the website, without the panels: the app supplies those. */
function EmbedMap({ staticData, live, forecast, heatmap, index, showHeat, id, onSelect }) {
  const controls = useRef({});
  const [probe, setProbe] = useState(null);
  useEffect(() => {
    window.bulosFocus = (station) => { setProbe(null); controls.current.focus?.(station, { right: 12, top: 110, bottom: 340 }); };
    window.bulosHome = () => { setProbe(null); controls.current.home?.(); };
  }, []);
  const time = useTwinTime(live, forecast);
  const view = useMemo(() => ({ mapLabels: true, hazard: showHeat && index !== 'none' ? index : 'none', opacity: 0.7, palette: 'hazard', base: 'satellite', relief: 1.5 }), [index, showHeat]);
  if (!staticData || !live) return <Loading text="Loading the 3D map…" />;
  return (
    <>
      <TwinMapScene staticData={staticData} live={live} hazard={showHeat && index !== 'none' ? heatmap : null} view={view} atTime={time.atTime} tauStep={0} selectedId={id}
                    onPick={onSelect} onInspect={onSelect} layers={LAYERS} controls={controls} insets={{ left: 12, right: 12, top: 110, bottom: 160 }}
                    probe={probe} onProbe={(at) => { setProbe(at); send({ type: 'probe', lat: at.lat, lon: at.lon }); }} />
      <MapCredits className="absolute right-3 top-[116px] z-10" drop="down" />
    </>
  );
}

export default function Embed({ mode, params }) {
  const [index, setIndex] = useState(params.get('index') ?? 'risk');
  useEffect(() => { window.bulosSetIndex = setIndex; }, []);
  const { data: staticData } = usePoll('/api/static', 0);
  const { data: live } = usePoll('/api/state', 2000);
  const { data: heatmap } = usePoll(mode === 'map' && index !== 'none' ? `/api/heatmap?index=${index}` : null, 5000);
  const { data: forecast } = usePoll(mode === 'map' ? '/api/forecast' : null, 4000);
  const select = useCallback((id) => send({ type: 'select', id }), []);
  // Tell the app when there is something on screen, so it can lift its loading cover
  useEffect(() => {
    const id = setInterval(() => { if (document.querySelector('canvas')) { clearInterval(id); setTimeout(() => send({ type: 'ready' }), 1200); } }, 400);
    return () => clearInterval(id);
  }, []);
  const st = live?.stations.find((s) => s.id === params.get('id'));

  return (
    <div className="fixed inset-0 bg-panel-2">
      {mode === 'map' && (
        <Suspense fallback={<Loading text="Loading the 3D map…" />}>
          <EmbedMap staticData={staticData} live={live} forecast={forecast} heatmap={heatmap} index={index} showHeat={params.get('heatmap') !== '0'} id={params.get('id') ?? ''} onSelect={select} />
        </Suspense>
      )}
      {mode === 'site' && (st ? (
        <Suspense fallback={<Loading text="Loading the 3D site view…" />}>
          <SiteScene st={st} />
        </Suspense>
      ) : <Loading text={live ? 'Unknown water point.' : 'Connecting to the data server…'} />)}
    </div>
  );
}
