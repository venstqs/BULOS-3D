// One rule for the colour of water, used by every map, chart, model and legend.
// te: turbidity above normal (NTU). od: ORP below normal (mV), which falls when sewage is present.
const TURB_FULL = 30;
const ORP_FULL = 150;

/** Red, green and blue from 0 to 255. Clean is blue, muddy is brown, sewage is maroon, both is red. */
export function waterRgb(te = 0, od = 0) {
  const t = Math.min(1, Math.max(0, te / TURB_FULL));
  const o = Math.min(1, Math.max(0, od / ORP_FULL));
  return [
    Math.round(255 * Math.min(1, 0.2 + 0.56 * t + 0.34 * o)),
    Math.round(255 * Math.max(0, 0.66 - 0.32 * t - 0.46 * o)),
    Math.round(255 * Math.max(0, 1 - 0.8 * t - 0.68 * o)),
  ];
}

export const waterCss = (te, od) => `rgb(${waterRgb(te, od).join(',')})`;

/** How far from clean the water is, from 0 to 1. */
export const waterDirt = (te = 0, od = 0) => Math.max(Math.min(1, Math.max(0, te / TURB_FULL)), Math.min(1, Math.max(0, od / ORP_FULL)));

/** The legend for water. Each colour is what the river really turns. */
export const WATER_KEY = [
  ['Clean', waterCss(0, 0)],
  ['Muddy (high turbidity)', waterCss(TURB_FULL, 0)],
  ['Sewage (low ORP)', waterCss(0, ORP_FULL)],
  ['Muddy and sewage', waterCss(TURB_FULL, ORP_FULL)],
];
