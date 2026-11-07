import { Compass, FileText, Gauge, Info, LineChart, MapPin, MapPinned, Mountain, Wrench } from 'lucide-react';

const ICONS = { home: Compass, overview: Gauge, map: Mountain, flow: LineChart, points: MapPin, maintenance: Wrench, reports: FileText, about: Info };

/** Every page outside the map: the same hanging white panel on the left, a plain calm ground. */
export default function PageShell({ pages, page, go, status, lite, setLite, title, sub, actions, children, footer }) {
  return (
    <div className="page-shell">
      <aside className="page-nav lg:fixed lg:bottom-3 lg:left-3 lg:top-3 lg:z-30 lg:w-[208px]">
        <button onClick={() => go('home')} className="flex shrink-0 items-center gap-2.5 px-2 py-1.5 text-left">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="font-display text-[15px] font-semibold">Bulos 3D</span>
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
          <button onClick={() => setLite(!lite)} title={lite ? 'Turn the 3D map on' : 'Turn the 3D map off for a faster, lighter app'} className="mt-1 flex items-center gap-1.5 text-muted hover:text-ink">
            <MapPinned size={13} />3D map {lite ? 'off' : 'on'}
          </button>
        </div>
      </aside>

      <div className="px-3 pb-6 lg:pl-[232px] lg:pr-3">
        <header className="page-top flex flex-wrap items-start justify-between gap-3 pb-3 pt-4">
          <div className="min-w-0">
            {title && <h1 className="font-display text-[26px] font-semibold leading-tight">{title}</h1>}
            {sub && <p className="mt-0.5 max-w-[72ch] text-sm text-ink-2">{sub}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </header>
        <main>{children}</main>
        {footer}
      </div>
    </div>
  );
}
