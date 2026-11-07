// Sizes shared by the bottom dock, the screens that sit above it, and the opening animation.
export const DOCK_H = 66;
export const HUB = 80;
export const HUB_INNER = 58;

export const dockBottom = (inset) => Math.max(inset - 8, 12);

/** How much room to leave at the bottom of a screen for the dock. */
export const dockSpace = (inset) => dockBottom(inset) + DOCK_H + 16;

/** Distance from the bottom of the screen to the centre of the round button. */
export const hubY = (inset) => dockBottom(inset) + DOCK_H / 2 + 10;
