import { useEffect, useMemo, useRef, useState } from 'react';
import { get } from '../api';
import { AHEAD_S, PAST_S, stationsAt } from './twinField';

const SLIDER_STEP = 300;        // the data has 5-minute resolution
const REPLAY_S = 24;            // one pass of the time slider at normal speed
const SPEEDS = [1, 2, 4];

/** The time slider, shared by every 3D engine: tau is seconds from now, 0 = live. */
export function useTwinTime(live, forecast) {
  const [tau, setTau] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const position = useRef(0);      // the exact time while playing; the screen only updates on each 5-minute step
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
    let shown = Math.round(position.current / SLIDER_STEP);
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      position.current += (dt / REPLAY_S) * speed * (PAST_S + AHEAD_S);
      if (position.current >= AHEAD_S) {
        position.current = AHEAD_S;
        setTau(AHEAD_S);
        setPlaying(false);
        return;
      }
      const at = Math.round(position.current / SLIDER_STEP);
      if (at !== shown) { shown = at; setTau(at * SLIDER_STEP); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const tauStep = Math.round(tau / SLIDER_STEP) * SLIDER_STEP;
  const atTime = useMemo(() => (live ? stationsAt(tauStep, live, forecast, history) : null), [tauStep, live, forecast, history]);

  return {
    tau, tauStep, atTime, playing, speed, step: SLIDER_STEP,
    scrub: (v) => { setPlaying(false); position.current = v; setTau(v); },
    toNow: () => { setPlaying(false); position.current = 0; setTau(0); },
    nextSpeed: () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]),
    togglePlay: () => {
      // Plays on from where you are; at the very end it starts again from 6 hours ago
      if (!playing && position.current >= AHEAD_S - SLIDER_STEP) { position.current = -PAST_S; setTau(-PAST_S); }
      setPlaying((p) => !p);
    },
  };
}
