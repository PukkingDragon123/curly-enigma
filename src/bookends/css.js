// Styles for the title and ending screens. Injected while one of those scenes is active
// (the shared stylesheet is owned by the UI module) and removed again on exit.
const CSS = /* css */`
.bk-root { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.bk-root button { pointer-events: auto; }
.bk-outline { text-shadow: var(--px) 0 0 #2a1430, calc(var(--px) * -1) 0 0 #2a1430, 0 var(--px) 0 #2a1430, 0 calc(var(--px) * -1) 0 #2a1430,
  var(--px) var(--px) 0 #2a1430, calc(var(--px) * -1) var(--px) 0 #2a1430, 0 calc(var(--px) * 2) 0 rgba(0,0,0,.35); }

/* ---------- title ---------- */
.bk-left { position: absolute; left: calc(var(--px) * 18); top: 47%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: flex-start; }
.bk-logo { font-size: calc(var(--px) * 40); white-space: nowrap; margin: 0; line-height: .82; }
.bk-logo span { display: inline-block; animation: bkDrop .8s cubic-bezier(.25,1.7,.45,1) both, bkBob 3.6s ease-in-out infinite;
  animation-delay: calc(var(--i) * 75ms + 250ms), calc(var(--i) * 140ms + 1.4s); }
.bk-logo .bk-o { color: #ffe9a0; }
@keyframes bkDrop { from { transform: translateY(calc(var(--px) * -40)) scale(1, 1.3); opacity: 0; } 55% { opacity: 1; } to { transform: none; opacity: 1; } }
@keyframes bkBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(calc(var(--px) * -1.5)); } }
.bk-sub { margin: calc(var(--px) * 5) 0 0 calc(var(--px) * 1); font-size: calc(var(--px) * 7.2); color: #ffe8c8; letter-spacing: .02em;
  animation: bkFadeUp 1s ease-out 1.1s both; display: flex; align-items: center; gap: calc(var(--px) * 3); }
.bk-sub i { display: inline-block; width: calc(var(--px) * 3); height: calc(var(--px) * 3); background: var(--gold); box-shadow: 0 0 0 var(--px) #2a1430; transform: rotate(45deg); }
@keyframes bkFadeUp { from { transform: translateY(calc(var(--px) * 6)); opacity: 0; } to { transform: none; opacity: 1; } }
.bk-menu { display: flex; flex-direction: column; gap: calc(var(--px) * 3.5); margin-top: calc(var(--px) * 12); width: calc(var(--px) * 82); }
.bk-menu .btn { width: 100%; text-align: left; font-size: 1.1em; padding: calc(var(--px) * 2.5) calc(var(--px) * 5); position: relative;
  animation: bkSlideIn .5s cubic-bezier(.2,1.4,.4,1) both; animation-delay: calc(var(--i) * 90ms + 1.5s); }
.bk-menu .btn::after { content: '›'; position: absolute; right: calc(var(--px) * 4); opacity: 0; transition: opacity .15s, transform .15s; }
.bk-menu .btn:hover::after, .bk-menu .btn:focus-visible::after { opacity: .8; transform: translateX(var(--px)); }
@keyframes bkSlideIn { from { transform: translateX(calc(var(--px) * -24)); opacity: 0; } to { transform: none; opacity: 1; } }
.bk-controls { position: absolute; left: 0; right: 0; bottom: calc(var(--px) * 5 + env(safe-area-inset-bottom, 0px)); text-align: center; font-size: .68em;
  color: #f0dcc0; opacity: .85; animation: bkFadeUp 1s ease-out 2.2s both; white-space: nowrap; }
.bk-controls kbd { font-size: .92em; margin-right: var(--px); text-shadow: none; }
.bk-controls .dot { opacity: .5; margin: 0 calc(var(--px) * 2.5); }
.bk-sound { position: absolute; right: calc(var(--px) * 7); top: calc(var(--px) * 6); font-size: .7em; color: #f6e6cc; display: flex; align-items: center; gap: calc(var(--px) * 2);
  animation: bkFadeUp .8s ease-out 2.6s both; transition: opacity .6s; }
.bk-sound .note { display: inline-block; animation: bkNote 1.4s ease-in-out infinite; color: var(--gold); font-size: 1.3em; }
.bk-sound.gone { opacity: 0; }
@keyframes bkNote { 0%, 100% { transform: translateY(0) rotate(-8deg); } 50% { transform: translateY(calc(var(--px) * -2)) rotate(8deg); } }
.bk-ver { position: absolute; right: calc(var(--px) * 7); bottom: calc(var(--px) * 5); font-size: .55em; opacity: .45; color: #f0dcc0; }
.bk-credits-body p { margin: 0 0 calc(var(--px) * 2.5); max-width: 46ch; line-height: 1.35; }
.bk-credits-body ul { margin: 0 0 calc(var(--px) * 3); padding-left: calc(var(--px) * 6); line-height: 1.45; }
.bk-credits-body .muted { font-size: .85em; }

@media (max-aspect-ratio: 5/4) {
  .bk-left { left: 50%; top: calc(var(--px) * 10); transform: translateX(-50%); align-items: center; }
  .bk-logo { font-size: calc(var(--px) * 30); }
  .bk-sub { margin-left: 0; font-size: calc(var(--px) * 6); }
  .bk-menu { position: fixed; left: 50%; bottom: calc(var(--px) * 18); transform: translateX(-50%); margin: 0; }
  .bk-controls { white-space: normal; padding: 0 calc(var(--px) * 4); }
}

/* ---------- ending ---------- */
.bk-depth { position: absolute; right: calc(var(--px) * 16); top: 50%; transform: translateY(-50%); text-align: right; transition: opacity .6s; }
.bk-depth .lbl { font-size: .8em; letter-spacing: .25em; color: #f6e6cc; opacity: .85; }
.bk-depth .num { font-family: var(--font-display); font-size: calc(var(--px) * 34); line-height: .9; color: var(--gold); font-variant-numeric: tabular-nums; white-space: nowrap;
  text-shadow: 0 calc(var(--px) * 2) 0 var(--gold-dk), 0 calc(var(--px) * 4) 0 var(--wood-dk), calc(var(--px) * 2) 0 0 var(--wood-dk), calc(var(--px) * -2) 0 0 var(--wood-dk), 0 calc(var(--px) * -2) 0 var(--wood-dk), 0 calc(var(--px) * 6) 0 rgba(0,0,0,.4); }
.bk-depth .num small { font-size: .5em; margin-left: calc(var(--px) * 2); }
.bk-depth .zone { margin-top: calc(var(--px) * 3); font-size: 1.05em; font-weight: 700; letter-spacing: .06em; transition: color .4s; }
.bk-depth .zone.pop { animation: bkZonePop .45s cubic-bezier(.2,1.6,.4,1); }
@keyframes bkZonePop { from { transform: translateX(calc(var(--px) * 8)); opacity: 0; } }
.bk-zbar { position: absolute; right: calc(var(--px) * 6); top: 50%; transform: translateY(-50%); width: calc(var(--px) * 4); height: calc(var(--px) * 110);
  border: var(--px) solid #1a0e14; background: #1a0e14; display: flex; flex-direction: column; transition: opacity .6s; }
.bk-zbar i { flex: 1; display: block; border-top: var(--px) solid #1a0e14; opacity: .85; }
.bk-zbar b { position: absolute; left: calc(var(--px) * -3); width: calc(var(--px) * 10); height: calc(var(--px) * 3); background: #fff6d8; box-shadow: 0 0 0 var(--px) #2a1430; transform: translateY(50%); }
.bk-line { position: absolute; left: 0; right: 0; bottom: 20%; text-align: center; font-size: calc(var(--px) * 12); color: #fff4e0; letter-spacing: .03em;
  opacity: 0; transition: opacity 1.6s ease, transform 1.6s ease; transform: translateY(calc(var(--px) * 3)); }
.bk-line.on { opacity: 1; transform: none; }
.bk-line span { opacity: 0; transition: opacity 1.4s ease; }
.bk-line.on span.late { opacity: 1; transition-delay: 1.3s; }
.bk-line.on span.early { opacity: 1; }
.bk-veil { position: absolute; inset: 0; background: linear-gradient(90deg, transparent 18%, rgba(36,14,40,.42) 34%, rgba(36,14,40,.42) 66%, transparent 82%); opacity: 0; transition: opacity 1.5s; }
.bk-veil.on { opacity: 1; }
.bk-credits { position: absolute; left: 50%; top: 0; width: min(calc(100vw - 32px), calc(var(--px) * 150)); transform: translateX(-50%); text-align: center; color: #fff4e0; }
.bk-roll { will-change: transform; padding-bottom: 4vh; }
.bk-roll .big-title { font-size: calc(var(--px) * 30); margin-bottom: calc(var(--px) * 3); }
.bk-roll .tag { font-size: 1.05em; color: #ffe0c0; margin-bottom: calc(var(--px) * 22); }
.bk-roll h3 { font-family: var(--font-display); font-weight: 400; font-size: 1.8em; color: var(--gold); margin: calc(var(--px) * 16) 0 calc(var(--px) * 5); letter-spacing: .04em; }
.bk-roll p { margin: 0 0 calc(var(--px) * 2.5); line-height: 1.4; }
.bk-roll .soft { color: #ffd8c8; font-size: .9em; }
.bk-stats { display: grid; grid-template-columns: 1fr auto; gap: calc(var(--px) * 2.2) calc(var(--px) * 4); text-align: left; margin: 0 auto; width: min(100%, calc(var(--px) * 120)); }
.bk-stats dt { display: flex; align-items: baseline; gap: calc(var(--px) * 2); color: #ffe8d0; }
.bk-stats dt::after { content: ''; flex: 1; border-bottom: var(--px) dotted rgba(255,230,200,.55); transform: translateY(calc(var(--px) * -1)); }
.bk-stats dd { margin: 0; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; text-align: right; }
.bk-stats dd.gold { color: var(--gold); }
.bk-thanks { font-family: var(--font-display); font-size: calc(var(--px) * 20); color: var(--gold); margin: calc(var(--px) * 26) 0 calc(var(--px) * 6); line-height: 1; }
.bk-end { display: flex; gap: calc(var(--px) * 4); justify-content: center; flex-wrap: wrap; opacity: 0; transform: translateY(calc(var(--px) * 4)); transition: opacity .8s, transform .8s; pointer-events: none; }
.bk-end.on { opacity: 1; transform: none; }
.bk-end.on button { pointer-events: auto; }
.bk-dock { position: absolute; right: calc(var(--px) * 6); bottom: calc(var(--px) * 6); display: flex; gap: calc(var(--px) * 2); opacity: 0; transition: opacity .6s; }
.bk-dock.on { opacity: .8; }
.bk-dock .btn { font-size: .8em; padding: var(--px) calc(var(--px) * 3); }
.bk-skip { position: absolute; right: calc(var(--px) * 6); bottom: calc(var(--px) * 6); font-size: .75em; padding: var(--px) calc(var(--px) * 3); opacity: .5; transition: opacity .3s; }
.bk-skip:hover, .bk-skip:focus-visible { opacity: 1; }
`;

let refs = 0;
let styleEl = null;

/** Inject the bookend styles; returns a remover. Reference counted so scene hand-offs are safe. */
export function useBookendStyles() {
  refs++;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'bookends-css';
    styleEl.textContent = CSS;
    document.head.append(styleEl);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    refs = Math.max(0, refs - 1);
    if (!refs && styleEl) { styleEl.remove(); styleEl = null; }
  };
}
