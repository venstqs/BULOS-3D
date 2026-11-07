import { useEffect, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { post } from '../api';
import { fmtMin } from '../lib/format';

const STEPS = 8;
const CLEAR_OF_CARD = { bottom: 240, right: 40 };

/** One click plays the whole pitch on the map, with captions. Everything it shows is simulated. */
export default function GuidedDemo({ live, forecast, controls, time, onClose }) {
  const [step, setStep] = useState({ n: 1, title: 'Getting ready', text: '' });
  const latest = useRef({});
  latest.current = { live, forecast, time };
  const skip = useRef(null);

  useEffect(() => {
    let stopped = false;
    const wait = (ms) => new Promise((done) => {
      const id = setTimeout(done, ms);
      skip.current = () => { clearTimeout(id); done(); };
    });
    const until = async (test, ms) => {
      const end = Date.now() + ms;
      while (!stopped && Date.now() < end) {
        const hit = test();
        if (hit) return hit;
        await wait(500);
      }
      return null;
    };
    const say = (n, title, text) => { if (!stopped) setStep({ n, title, text }); };
    const fly = (name, ...args) => controls.current[name]?.(...args);
    const nextPlume = () => {
      const fc = latest.current.forecast?.stations ?? latest.current.live?.forecast?.stations ?? {};
      return Object.entries(fc).filter(([, v]) => v.arrival_s > 0).sort((a, b) => a[1].arrival_s - b[1].arrival_s)[0];
    };
    const closedPoint = () => latest.current.live?.stations.find((s) => s.valve && !s.valve.open);

    (async () => {
      await post('/api/scenario', { name: 'RESET' }).catch(() => {});
      await post('/api/speed', { speed: 60 }).catch(() => {});
      latest.current.time.toNow();
      fly('home');
      say(1, 'The real river', 'This is the river from the slopes of Mt. Isarog to Naga City, on real terrain and open map data.');
      await wait(7000);
      if (stopped) return;
      fly('focus', 'AG-02', CLEAR_OF_CARD);
      say(2, 'Five water points', 'Sensors would watch the water at five proposed sites. In this prototype, their readings are simulated.');
      await wait(8000);
      if (stopped) return;
      fly('home');
      say(3, 'A spill starts', 'In this simulation, a piggery lagoon fails and raw waste enters the river upstream of AG-02.');
      await post('/api/speed', { speed: 240 }).catch(() => {});
      await post('/api/scenario', { name: 'SEPTIC' }).catch(() => {});
      await wait(4000);
      const plume = await until(nextPlume, 40000);
      if (stopped) return;
      say(4, 'The twin sees it coming', plume ? `The river model forecasts that the plume reaches ${plume[0]} in about ${fmtMin(plume[1].arrival_s)}.` : 'The river model is working out where the plume will go.');
      await wait(6000);
      if (stopped) return;
      const point = await until(closedPoint, 40000);
      if (stopped) return;
      if (point) fly('focus', point.id, CLEAR_OF_CARD);
      say(5, 'The intake closes itself', point ? `${point.id} closes before the polluted water arrives, so ${(point.population ?? 0).toLocaleString()} people stay on stored water.` : 'The twin keeps watching each intake as the plume moves.');
      await wait(8000);
      if (stopped) return;
      if (point) await post('/api/advisory', { station_ids: [point.id], message: null, sent_by: 'Guided demo' }).catch(() => {});
      say(6, 'People are warned', 'An advisory is prepared for the health worker. In this prototype, no text message is really sent.');
      await wait(7000);
      if (stopped) return;
      fly('home');
      latest.current.time.scrub(7200);
      say(7, 'Looking ahead', 'Moving time forward two hours shows where the plume goes next, before it gets there.');
      await wait(7000);
      if (stopped) return;
      latest.current.time.toNow();
      say(8, 'The result', 'In simulation, this design blocked 93% of contaminated water time from a spill, with no false shut-offs in our tests.');
      await wait(8000);
      if (!stopped) onClose();
    })();

    return () => {
      stopped = true;
      skip.current?.();
      latest.current.time.toNow();
      post('/api/scenario', { name: 'RESET' }).catch(() => {});
      post('/api/speed', { speed: 60 }).catch(() => {});
      controls.current.home?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-label="Guided demo" aria-live="polite" className="demo-card absolute bottom-14 left-1/2 z-[40] w-[min(560px,calc(100%-24px))] -translate-x-1/2">
      <div className="h-1 overflow-hidden rounded-t-xl bg-[#e4ecff]"><i className="block h-full bg-civic transition-[width] duration-500" style={{ width: `${(step.n / STEPS) * 100}%` }} /></div>
      <div className="flex items-start gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-civic">Step {step.n} of {STEPS}</div>
          <h2 className="font-display text-[17px] font-semibold leading-snug">{step.title}</h2>
          <p className="mt-0.5 min-h-[40px] text-[13.5px] leading-relaxed text-ink-2">{step.text}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button onClick={onClose} aria-label="Stop the guided demo" className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"><X size={15} /></button>
          <button onClick={() => skip.current?.()} className="btn-ghost !px-2.5 !py-1.5"><ChevronRight size={14} />Next</button>
        </div>
      </div>
    </section>
  );
}
