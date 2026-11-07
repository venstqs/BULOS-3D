import { Suspense, lazy, useCallback, useMemo, useRef } from 'react';
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
  const time = useTwinTime(live, forecast);
  const view = useMemo(() => ({ mapLabels: true, hazard: showHeat ? index : 'none', opacity: 0.7, palette: 'hazard', base: 'satellite', relief: 1.5 }), [index, showHeat]);
  if (!staticData || !live) return <Loading text="Loading the 3D map…" />;
  return (
    <>
      <TwinMapScene staticData={staticData} live={live} hazard={showHeat ? heatmap : null} view={view} atTime={time.atTime} tauStep={0} selectedId={id}
                    onPick={onSelect} onInspect={onSelect} layers={LAYERS} controls={controls} insets={{ left: 12, right: 12, top: 12, bottom: 12 }} />
      <MapCredits className="absolute bottom-3 right-3 z-10" />
    </>
  );
}

export default function Embed({ mode, params }) {
  const index = params.get('index') ?? 'risk';
  const { data: staticData } = usePoll('/api/static', 0);
  const { data: live } = usePoll('/api/state', 2000);
  const { data: heatmap } = usePoll(mode === 'map' ? `/api/heatmap?index=${index}` : null, 5000);
  const { data: forecast } = usePoll(mode === 'map' ? '/api/forecast' : null, 4000);
  const select = useCallback((id) => send({ type: 'select', id }), []);
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
