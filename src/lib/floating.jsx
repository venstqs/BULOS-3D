import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GripHorizontal } from 'lucide-react';

// Panels that can be picked up and placed anywhere, like windows on a desktop.
// Each one remembers where it was left. Double-click its grip to send one back; "Reset panels" sends all back.
const KEY = 'bulos-panels';
const RESET = 'bulos-panels-reset';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const write = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* the panel still moves, it just will not be remembered */ } };

export const resetPanels = () => { write({}); window.dispatchEvent(new Event(RESET)); };
const movable = () => window.matchMedia('(min-width: 768px)').matches;

/** True once any panel has been moved, so the reset button only shows when it has something to do. */
export function usePanelsMoved() {
  const [moved, setMoved] = useState(() => Object.keys(read()).length > 0);
  useEffect(() => {
    const check = () => setMoved(Object.keys(read()).length > 0);
    window.addEventListener(RESET, check);
    window.addEventListener('bulos-panels-moved', check);
    return () => { window.removeEventListener(RESET, check); window.removeEventListener('bulos-panels-moved', check); };
  }, []);
  return moved;
}

/** Keep a panel fully on screen, with its top edge always reachable. */
function clamp(el, x, y, base) {
  const r = el.getBoundingClientRect();
  const [left, top] = [r.left - base.x, r.top - base.y];
  return {
    x: Math.round(Math.min(window.innerWidth - r.width - left - 4, Math.max(4 - left, x))),
    y: Math.round(Math.min(window.innerHeight - 44 - top, Math.max(4 - top, y))),
  };
}

export function useFloating(id) {
  const ref = useRef(null);
  const [at, setAt] = useState(() => (movable() ? read()[id] ?? { x: 0, y: 0 } : { x: 0, y: 0 }));
  const [lifted, setLifted] = useState(false);
  const live = useRef(at);
  live.current = at;

  useEffect(() => {
    const back = () => setAt({ x: 0, y: 0 });
    const fit = () => { if (ref.current && movable()) setAt((p) => clamp(ref.current, p.x, p.y, p)); else setAt({ x: 0, y: 0 }); };
    window.addEventListener(RESET, back);
    window.addEventListener('resize', fit);
    return () => { window.removeEventListener(RESET, back); window.removeEventListener('resize', fit); };
  }, []);
  useLayoutEffect(() => { if (ref.current && movable()) setAt((p) => clamp(ref.current, p.x, p.y, p)); }, []);

  const save = useCallback((p) => {
    const all = read();
    if (p.x || p.y) all[id] = p; else delete all[id];
    write(all);
    window.dispatchEvent(new Event('bulos-panels-moved'));
  }, [id]);

  const grab = useCallback((e) => {
    if (e.button !== 0 || !movable() || !ref.current) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ...live.current };
    setLifted(true);
    const move = (ev) => setAt(clamp(ref.current, start.x + ev.clientX - start.px, start.y + ev.clientY - start.py, live.current));
    const drop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', drop);
      window.removeEventListener('pointercancel', drop);
      setLifted(false);
      save(live.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', drop);
  }, [save]);

  const home = useCallback(() => { setAt({ x: 0, y: 0 }); save({ x: 0, y: 0 }); }, [save]);
  return { ref, grab, home, lifted, style: at.x || at.y ? { transform: `translate(${at.x}px, ${at.y}px)` } : undefined };
}

/** The bar a panel is carried by. Arrow keys nudge it, for anyone not using a mouse. */
export function Grip({ float, label = 'Move panel', className = '', children }) {
  const nudge = (e) => {
    const step = e.shiftKey ? 40 : 12;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    float.nudge?.(d);
  };
  return (
    <div onPointerDown={float.grab} onDoubleClick={float.home} onKeyDown={nudge} title={`${label}. Double-click to put it back.`} className={`panel-grip ${className}`}>
      {children}
      <GripHorizontal size={14} aria-hidden="true" className="panel-grip-icon" />
    </div>
  );
}

/** A positioned panel that can be dragged by its grip. */
export function Floating({ id, className = '', children, label, grip = true, ...rest }) {
  const float = useFloating(id);
  return (
    <div ref={float.ref} style={float.style} data-lifted={float.lifted || undefined} className={`floating ${className}`} {...rest}>
      {grip && <Grip float={float} label={label} />}
      {children}
    </div>
  );
}
