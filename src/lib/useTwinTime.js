import { useEffect, useMemo, useState } from 'react';
import { get } from '../api';
import { AHEAD_S, PAST_S, stationsAt } from './twinField';

const SLIDER_STEP = 300;        // the data has 5-minute resolution
const REPLAY_S = 24;            // one pass of the time slider

/** The time slider, shared by every 3D engine: tau is seconds from now, 0 = live. */
export function useTwinTime(live, forecast) {
  const [tau, setTau] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState(null);
  const lookingBack = tau < 0;
  const hasLive = Boolean(live);

  useEffect(() => {
    if (!lookingBack || !hasLive) return undefined;   // recorded readings load only when someone looks back
    let alive = true;
    const load = () => Promise.all(live.stations.map((s) => get(`/api/history/${s.id}?minutes=${PAST_S / 60}`).then((h) => [s.id, h.series])))
      .then((rows) => { if (alive) setHistory(Object.fromEntries(rows)); }).catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookingBack, hasLive]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setTau((t) => {
        const next = t + (dt / REPLAY_S) * (PAST_S + AHEAD_S);
        if (next >= AHEAD_S) { setPlaying(false); return AHEAD_S; }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const tauStep = Math.round(tau / SLIDER_STEP) * SLIDER_STEP;
  const atTime = useMemo(() => (live ? stationsAt(tauStep, live, forecast, history) : null), [tauStep, live, forecast, history]);

  return {
    tau, tauStep, atTime, playing, step: SLIDER_STEP,
    scrub: (v) => { setPlaying(false); setTau(v); },
    toNow: () => { setPlaying(false); setTau(0); },
    togglePlay: () => {
      if (!playing && (tau >= AHEAD_S - SLIDER_STEP || tau === 0)) setTau(-PAST_S);
      setPlaying((p) => !p);
    },
  };
}
