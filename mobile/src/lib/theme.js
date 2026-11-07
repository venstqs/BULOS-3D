// Same white and blue design as the Bulos 3D website.
export const C = {
  bgTop: '#ffffff',
  bgBottom: '#ffffff',
  card: '#f2f6fe',
  tile: '#ffffff',
  panel2: '#e8effe',
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

// The band across the top of each section: calm, watch and alert
export const SKY = {
  calm: '#2750dc',
  watch: '#a85d0c',
  alert: '#a82020',
};

// Soft colours for tiles and icons: [background, icon]
export const TINT = {
  blue: ['#e3ecff', '#2f5be7'],
  aqua: ['#d8f4f1', '#0a7a73'],
  sun: ['#fff0c4', '#8f6300'],
  coral: ['#ffe3da', '#c0442a'],
  violet: ['#ebe5ff', '#5b3fd1'],
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
  shadowColor: '#1c3fa8',
  shadowOpacity: 0.14,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 7,
};

export const FONT = {
  // components/Text.jsx turns these weights into Sora and Inter
  hero: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: C.ink, letterSpacing: -0.6 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: C.ink, letterSpacing: -0.4 },
  h2: { fontSize: 16, fontWeight: '700', color: C.ink },
  body: { fontSize: 14, lineHeight: 20, color: C.ink },
  small: { fontSize: 12, lineHeight: 17, color: C.muted },
};
