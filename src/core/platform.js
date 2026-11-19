// The platform: Burrowsmith is a PC (Steam) game. There are no phone quality caps or LOD downgrades
// anywhere (PHONE is always false), and the on-screen touch controls stay in the code but are off
// unless asked for: ?touch=1 (the touch e2e test) or localStorage 'burrowsmith.touch' = '1'.
export const PHONE = false;

/** Turn on the touch controls (the `is-touch` class) for this page? Never by itself on a touch device. */
export function touchWanted() {
  try {
    const q = new URLSearchParams(window.location.search).get('touch');
    if (q !== null) return q === '1';
    return window.localStorage.getItem('burrowsmith.touch') === '1';
  } catch (e) { return false; }
}
