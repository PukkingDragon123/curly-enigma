// Pixel fonts are only crisp when each font pixel lands on whole device pixels: Tiny5 at 8n
// device px, Jersey 15 at 27n. Publish those grids in CSS px for this screen (--g, --gj) so the
// stylesheets can snap every font size with round(nearest, size, var(--g)).
export function setupFontGrid() {
  const root = document.documentElement;
  let last = 0;
  const apply = () => {
    const dpr = window.devicePixelRatio || 1;
    if (dpr === last) return;
    last = dpr;
    root.style.setProperty('--g', `${8 / dpr}px`);
    root.style.setProperty('--gj', `${27 / dpr}px`);
  };
  apply();
  window.addEventListener('resize', apply); // zoom and moving to another screen change the ratio
}
