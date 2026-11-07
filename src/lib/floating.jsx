import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GripHorizontal, Minus, Square, X } from 'lucide-react';

// Panels that can be picked up and placed anywhere, like windows on a desktop.
// Each one remembers where it was left, and whether it was minimized.
// Double-click its grip to send one back; "Reset panels" sends all back and opens them up again.
const KEY = 'bulos-panels';
const RESET = 'bulos-panels-reset';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const write = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* the panel still moves, it just will not be remembered */ } };

const MIN_KEY = 'bulos-panels-min';
const readMin = () => { try { return JSON.parse(localStorage.getItem(MIN_KEY)) ?? {}; } catch { return {}; } };
const writeMin = (all) => { try { localStorage.setItem(MIN_KEY, JSON.stringify(all)); } catch { /* it still folds, it just will not be remembered */ } };

export const resetPanels = () => { write({}); writeMin({}); window.dispatchEvent(new Event(RESET)); };
const movable = () => window.matchMedia('(min-width: 768px)').matches;

/** True once any panel has been moved, so the reset button only shows when it has something to do. */
export function usePanelsMoved() {
  const changed = () => Object.keys(read()).length + Object.keys(readMin()).length > 0;
  const [moved, setMoved] = useState(changed);
  useEffect(() => {
    const check = () => setMoved(changed());
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

/** Fold a panel down to a small title bar, so it stops covering the map. */
function useMinimized(id) {
  const [min, setMin] = useState(() => Boolean(readMin()[id]));
  useEffect(() => {
    const open = () => setMin(false);
    window.addEventListener(RESET, open);
    return () => window.removeEventListener(RESET, open);
  }, []);
  const toggle = useCallback(() => {
    setMin((was) => {
      const all = readMin();
      if (was) delete all[id]; else all[id] = true;
      writeMin(all);
      return !was;
    });
    window.dispatchEvent(new Event('bulos-panels-moved'));
  }, [id]);
  return [min, toggle];
}

function MinimizeButton({ min, toggle, title, className = '' }) {
  const Icon = min ? Square : Minus;
  return (
    <button onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={toggle} aria-expanded={!min} aria-label={`${min ? 'Restore' : 'Minimize'} ${title}`} title={min ? 'Restore' : 'Minimize'}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink ${className}`}>
      <Icon size={min ? 12 : 15} />
    </button>
  );
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
export function Floating({ id, className = '', children, label, grip = true, title, ...rest }) {
  const float = useFloating(id);
  const [min, toggle] = useMinimized(id);
  const folded = Boolean(title) && min;
  return (
    <div ref={float.ref} style={float.style} data-lifted={float.lifted || undefined} data-min={folded || undefined} className={`floating ${className}`} {...rest}>
      {grip && <Grip float={float} label={label} />}
      {title && <MinimizeButton min={min} toggle={toggle} title={title} className="!absolute right-1 top-0.5 z-[1]" />}
      {folded && <div onPointerDown={float.grab} className="cursor-grab truncate pb-2 pl-3.5 pr-9 font-display text-[14px] font-semibold">{title}</div>}
      {title ? <div className={folded ? 'hidden' : 'contents'}>{children}</div> : children}
    </div>
  );
}

/** A separate window: carried by its title bar, closed with its X, raised when clicked. */
export function MapWindow({ id, title, onClose, onRaise, dock = 0, className = '', children }) {
  const float = useFloating(id);
  const [min, toggle] = useMinimized(id);
  return (
    <div ref={float.ref} style={{ ...float.style, '--dock': dock }} data-lifted={float.lifted || undefined} data-min={min || undefined} onPointerDownCapture={onRaise} role="dialog" aria-label={title} className={`floating map-window ${className}`}>
      <div onPointerDown={float.grab} onDoubleClick={float.home} title="Drag to move. Double-click to put it back." className="map-window-bar">
        <h2 className="min-w-0 flex-1 truncate font-display text-[14px] font-semibold">{title}</h2>
        <MinimizeButton min={min} toggle={toggle} title={title} />
        <button onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label={`Close ${title}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"><X size={15} /></button>
      </div>
      <div className={min ? 'hidden' : 'min-h-0 flex-1 overflow-y-auto'}>{children}</div>
    </div>
  );
}
