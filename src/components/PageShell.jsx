import { HOSTED } from '../api';
import { Compass, FileText, Gauge, Info, LineChart, MapPin, MapPinned, Mountain, Wrench } from 'lucide-react';

const ICONS = { home: Compass, overview: Gauge, map: Mountain, flow: LineChart, points: MapPin, maintenance: Wrench, reports: FileText, about: Info };

/** Every page outside the map: the same hanging white panel on the left, a plain calm ground. */
const wavePath = 'M0 18 q 300 -20 600 0 t 600 0 t 600 0 t 600 0 V 40 H 0 Z';
const contours = Array.from({ length: 7 }, (_, k) => {
  let d = '';
  for (let x = -10; x <= 1810; x += 20) {
    const y = 16 + k * 30 + 13 * Math.sin(x / 110 + k * 0.7) + 7 * Math.sin(x / 43 + k * 1.9);
    d += `${d ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
  }
  return d;
});

export default function PageShell({ pages, page, go, status, lite, setLite, title, sub, actions, children, footer, mood = 'calm', chips, side }) {
  return (
    <div className="page-shell">
      <aside className="page-nav lg:fixed lg:bottom-3 lg:left-3 lg:top-3 lg:z-30 lg:w-[208px]">
        <button onClick={() => go('home')} className="flex shrink-0 items-center gap-2.5 px-2 py-1.5 text-left">
          <img src="/favicon.svg" alt="" className="h-12 w-12" />
          <span className="font-display text-[21px] font-semibold tracking-tight">Bulos 3D</span>
        </button>
        <nav aria-label="Main" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto lg:mt-3 lg:flex-col lg:overflow-visible">
          {pages.map(([id, label]) => {
            const Icon = ICONS[id] ?? Compass;
            return (
              <button key={id} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined} className="page-nav-item">
                <Icon size={16} strokeWidth={1.9} /><span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="hidden border-t border-line px-2 pt-2 text-[12px] text-ink-2 lg:block">
          {status !== 'online' && <div className="mb-1 font-medium text-[#a32626]">Data server offline</div>}
          {HOSTED && <div className="mb-1 leading-snug text-muted">Hosted demo. A simplified river runs in your browser.</div>}
          <button onClick={() => setLite(!lite)} title={lite ? 'Turn the 3D map on' : 'Turn the 3D map off for a faster, lighter app'} className="mt-1 flex items-center gap-1.5 text-muted hover:text-ink">
            <MapPinned size={13} />3D map {lite ? 'off' : 'on'}
          </button>
        </div>
      </aside>

      <div className="px-3 pb-6 lg:pl-[232px] lg:pr-3">
        <header className="page-top pt-4">
          <div className="page-sky" data-mood={mood} aria-hidden="true">
            <svg className="page-contours" viewBox="0 0 1800 220" preserveAspectRatio="xMinYMin slice">
              {contours.map((d) => <path key={d} d={d} fill="none" stroke="#fff" strokeWidth="1.3" />)}
            </svg>
            <svg className="page-wave back" viewBox="0 0 2400 40" preserveAspectRatio="none"><path d={wavePath} fill="#f3f6fb" /></svg>
            <svg className="page-wave" viewBox="0 0 2400 40" preserveAspectRatio="none"><path d={wavePath} fill="#f3f6fb" transform="translate(0 5)" /></svg>
          </div>
          <div className="page-head flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {title && <h1 className="font-display text-[28px] font-semibold leading-tight">{title}</h1>}
              {sub && <p className="page-sub mt-0.5 max-w-[72ch] text-sm">{sub}</p>}
              {chips && <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>}
            </div>
            {side}
            <div className="page-actions flex shrink-0 items-center gap-2 self-start">{actions}</div>
          </div>
        </header>
        <main>{children}</main>
        {footer}
      </div>
    </div>
  );
}
