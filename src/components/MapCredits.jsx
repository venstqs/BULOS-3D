import { useState } from 'react';
import { Info } from 'lucide-react';

const MAPBOX = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);
const CREDITS = [
  'Imagery © Esri, Maxar, Earthstar Geographics',
  ...(MAPBOX ? ['Mapbox imagery © Mapbox © Maxar'] : []),
  '© OpenStreetMap contributors, OpenFreeMap',
  'Terrain: Mapzen and AWS open data',
  'Elevation model: Copernicus GLO-90 (ESA/Airbus)',
  'Weather: Open-Meteo',
  'Textures: Poly Haven (CC0)',
  'Map engine: MapLibre GL',
];

/** The map's data credits, behind one small button so they never collide with anything. */
export default function MapCredits({ className = '', drop = 'up' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`pointer-events-auto ${className}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Map credits" title="Map credits" className="map-credit-button"><Info size={15} /></button>
      {open && (
        <div role="note" className={`site-panel absolute right-0 z-40 w-[270px] px-3 py-2.5 text-[12px] leading-relaxed text-ink-2 ${drop === 'up' ? 'bottom-9' : 'top-10'}`}>
          <div className="pb-1 font-display text-[13px] font-semibold text-ink">Map credits</div>
          {CREDITS.map((c) => <div key={c}>{c}</div>)}
        </div>
      )}
    </div>
  );
}
