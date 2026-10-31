// Same soft-aqua design language as the Bulos 3D website.
export const C = {
  bgTop: '#e3e9ff',
  bgBottom: '#cfe6fb',
  card: 'rgba(255,255,255,0.78)',
  tile: '#ffffff',
  panel2: '#f3f7ff',
  line: '#e3e9f7',
  ink: '#16204a',
  ink2: '#46517c',
  muted: '#7c86a9',
  primary: '#2f5be7',
  primaryLight: '#4f7cff',
  advisory: '#f2c200',
  good: '#12a150',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
};

// pill styles: [background, text]
export const PILL = {
  good: ['#e3f6ea', '#157a3e'],
  blue: ['#e7edff', '#2f5be7'],
  amber: ['#fff3cf', '#7a5600'],
  red: ['#fde6e6', '#a32626'],
  grey: ['#eef1f8', '#46517c'],
};

// Station identity colours, upstream -> downstream (same as the website).
export const STATION_COLOR = {
  'IN-01': '#2a78d6',
  'AG-02': '#eb6834',
  'KS-03': '#1baf7a',
  'MB-04': '#eda100',
  'RH-05': '#e87ba4',
};

export const shadow = {
  shadowColor: '#2f5be7',
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

export const FONT = {
  // system fonts keep Expo Go fast; weights carry the hierarchy
  title: { fontSize: 22, fontWeight: '700', color: C.ink, letterSpacing: -0.3 },
  h2: { fontSize: 16, fontWeight: '700', color: C.ink },
  body: { fontSize: 14, color: C.ink },
  small: { fontSize: 12, color: C.muted },
};
