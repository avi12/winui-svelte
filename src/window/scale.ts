/**
 * Notices a change of a window's scale (device pixels per device-independent
 * pixel). `readScale` is the one source of the number (the window's DPI in
 * production); `check` is called whenever the scale may have changed, and
 * `onChange` hears it only when it did.
 */
export function createScaleTracker({ readScale, onChange }: {
  readScale: () => number;
  onChange: (scale: number) => void;
}) {
  let known = readScale();
  return {
    check() {
      const scale = readScale();
      const isChanged = scale !== known;
      if (!isChanged) {
        return;
      }

      known = scale;
      onChange(scale);
    }
  };
}
