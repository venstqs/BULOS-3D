import { Suspense, lazy, useCallback, useState } from 'react';
import { usePoll } from './api';

// Full-screen 3D views embedded by the Bulos 3D mobile app in a WebView.
//   ?embed=map&index=risk     3D watershed (tap a water point -> app opens it)
//   ?embed=site&id=KS-03      isometric site model
const TwinView = lazy(() => import('./components/TwinView'));
const SiteScene = lazy(() => import('./components/AssetInspector').then((m) => ({ default: m.SiteScene })));

const send = (msg) => window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
const Loading = ({ text }) => <div className="flex h-full items-center justify-center text-sm text-muted">{text}</div>;

export default function Embed({ mode, params }) {
  const index = params.get('index') ?? 'risk';
  const { data: staticData } = usePoll('/api/static', 0);
  const { data: live } = usePoll('/api/state', 2000);
  const { data: heatmap } = usePoll(mode === 'map' ? `/api/heatmap?index=${index}` : null, 5000);
  const { data: forecast } = usePoll(mode === 'map' ? '/api/forecast' : null, 4000);
  const [layers, setLayers] = useState(() => ({
    heatmap: params.get('heatmap') !== '0', particles: true, streams: true, pipes: true, columns: true, catchment: true,
  }));
  const select = useCallback((id) => send({ type: 'select', id }), []);
  const st = live?.stations.find((s) => s.id === params.get('id'));

  return (
    <div className="fixed inset-0 bg-panel-2">
      {mode === 'map' && (
        <Suspense fallback={<Loading text="Loading the 3D map…" />}>
          <TwinView staticData={staticData} live={live} forecast={forecast} heatmap={heatmap} selectedId={params.get('id') ?? ''}
                       onSelect={select} onInspect={select} layers={layers} setLayers={setLayers} />
        </Suspense>
      )}
      {mode === 'site' && (st ? (
        <Suspense fallback={<Loading text="Loading the 3D site view…" />}>
          <SiteScene st={st} zoom={Math.max(20, Math.min(46, window.innerWidth / 15))} />
        </Suspense>
      ) : <Loading text={live ? 'Unknown water point.' : 'Connecting to the data server…'} />)}
    </div>
  );
}
