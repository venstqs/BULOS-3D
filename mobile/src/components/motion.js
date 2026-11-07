import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';

/** True when the phone is set to reduce motion. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduced;
}

// A phone without haptics should simply stay quiet.
const quiet = (run) => { try { run()?.catch?.(() => {}); } catch { /* not supported here */ } };
export const tapFeel = () => quiet(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const tickFeel = () => quiet(() => Haptics.selectionAsync());
