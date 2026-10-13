// Scoped styles for the cooking scene UI (injected once; all classes prefixed ck-).
const CSS = /* css */`
.ck-root { position: absolute; inset: 0; pointer-events: none; font-family: var(--font); }
.ck-root .interactive, .ck-root button { pointer-events: auto; }

/* ---------- pantry & result side panels ---------- */
.ck-side { position: absolute; right: calc(var(--px) * 5); top: calc(var(--px) * 34); bottom: calc(var(--px) * 5);
  width: min(calc(var(--px) * 172), calc(50vw - var(--px) * 6)); max-height: none; padding: calc(var(--px) * 6); animation: ckSlideIn .32s cubic-bezier(.2,1.3,.4,1); }
.ck-side.out { animation: ckSlideOut .25s ease-in forwards; }
@keyframes ckSlideIn { from { transform: translateX(calc(100% + var(--px) * 10)); } }
@keyframes ckSlideOut { to { transform: translateX(calc(100% + var(--px) * 10)); } }
.ck-side h2 { display: flex; align-items: baseline; gap: calc(var(--px) * 3); margin-bottom: calc(var(--px) * 2); }
.ck-side h2 small { font-family: var(--font); font-size: .42em; color: var(--ink-soft); letter-spacing: .02em; }
.ck-scroll { flex: 1; min-height: 0; overflow-y: auto; padding-right: calc(var(--px) * 2); scrollbar-color: var(--wood) var(--parch-2); }
.ck-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--icon) + var(--px) * 6), 1fr)); gap: calc(var(--px) * 2); }
.ck-grid .slot { transition: transform .08s; }
.ck-grid .slot:hover { transform: translateY(calc(var(--px) * -1)); }
.ck-grid .slot.on { background: #fff4d0; }
.ck-grid .slot img { width: var(--icon); height: var(--icon); }
.ck-grid .slot.on::after { content: ''; position: absolute; inset: calc(var(--px) * -1); border: var(--px) solid var(--gold-dk); box-shadow: 0 0 0 var(--px) var(--gold); pointer-events: none; }
.ck-grid .slot .n { text-shadow: 0 var(--px) 0 var(--parch); }
.ck-cat { grid-column: 1 / -1; font-size: .62em; letter-spacing: .14em; text-transform: uppercase; color: var(--wood-2); margin-top: calc(var(--px) * 1.5); border-bottom: var(--px) dashed var(--parch-3); }
.ck-empty { color: var(--ink-soft); font-size: .85em; line-height: 1.35; padding: calc(var(--px) * 3); text-align: center; }
.ck-info { min-height: calc(var(--px) * 9); font-size: .78em; color: var(--ink-soft); margin: calc(var(--px) * 2) 0; line-height: 1.25; }
.ck-info b { color: var(--ink); }
.ck-tray { display: flex; align-items: center; gap: calc(var(--px) * 2.5); padding-top: calc(var(--px) * 3); border-top: var(--px) solid var(--parch-3); }
.ck-tslot { width: calc(var(--icon) + var(--px) * 4); height: calc(var(--icon) + var(--px) * 4); background: var(--parch-2); border: var(--px) dashed var(--wood-2); display: grid; place-items: center; position: relative; flex: none; }
.ck-tslot.full { border-style: solid; background: #fff4d0; cursor: pointer; animation: ckBop .25s cubic-bezier(.2,1.8,.4,1); }
.ck-tslot img { width: var(--icon); height: var(--icon); }
.ck-tslot .x { position: absolute; right: calc(var(--px) * -2); top: calc(var(--px) * -2); width: calc(var(--px) * 6); height: calc(var(--px) * 6); background: var(--danger); color: #fff; font-size: .55em; display: grid; place-items: center; border: var(--px) solid var(--wood-dk); line-height: 1; }
.ck-plus { font-family: var(--font-display); color: var(--wood-2); font-size: 1.4em; }
@keyframes ckBop { from { transform: scale(.6); } }
.ck-tray .btn.big { margin-left: auto; font-family: var(--font-display); font-size: 1.6em; font-weight: 400; letter-spacing: .03em; padding: calc(var(--px) * 1) calc(var(--px) * 6); }
.ck-cookbtn:not([disabled]) { animation: ckPulse 1.2s ease-in-out infinite; }
@keyframes ckPulse { 50% { transform: scale(1.06); } }
.ck-leave { position: absolute; left: calc(var(--px) * 5); bottom: calc(var(--px) * 5); }
.ck-cards { display: flex; flex-direction: column; gap: calc(var(--px) * 2); }
.ck-card { display: grid; grid-template-columns: calc(var(--icon) + var(--px) * 2) 1fr auto; gap: calc(var(--px) * 3); align-items: center; padding: calc(var(--px) * 2); background: var(--parch-2); border: var(--px) solid var(--parch-3); cursor: pointer; position: relative; }
.ck-card:hover { border-color: var(--wood); background: #fff4d0; }
.ck-card.missing { cursor: default; }
.ck-card.missing:hover { border-color: var(--parch-3); background: var(--parch-2); }
.ck-card > img { width: var(--icon); height: var(--icon); background: var(--parch); border: var(--px) solid var(--parch-3); }
.ck-card .nm { font-weight: 700; line-height: 1.1; }
.ck-card .ings { display: flex; gap: var(--px); margin-top: var(--px); align-items: center; }
.ck-card .ings img { width: var(--icon-s); height: var(--icon-s); background: var(--parch); border: var(--px) solid var(--parch-3); }
.ck-card .ings img.no { opacity: .35; filter: grayscale(1); }
.ck-card .ings span { font-size: .6em; color: var(--danger); margin-left: var(--px); }
.ck-card .gr { font-family: var(--font-display); font-size: 1.3em; line-height: 1; text-align: right; }
.ck-card .gr small { display: block; font-family: var(--font); font-size: .45em; color: var(--ink-soft); }
.ck-secret { text-align: center; font-size: .75em; color: var(--ink-soft); padding: calc(var(--px) * 3) 0; }
.ck-secret b { font-family: var(--font-display); font-size: 1.5em; color: var(--wood-2); font-weight: 400; }

/* ---------- step HUD ---------- */
.ck-top { position: absolute; left: 50%; top: calc(var(--px) * 3); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--px) * 1.5); max-width: calc(100vw - var(--px) * 200); }
.ck-dish { font-family: var(--font-display); font-size: 1.7em; line-height: 1; color: var(--parch); letter-spacing: .03em; white-space: nowrap;
  text-shadow: 0 var(--px) 0 #000, var(--px) 0 0 #000, calc(var(--px) * -1) 0 0 #000, 0 calc(var(--px) * -1) 0 #000, 0 calc(var(--px) * 2) 0 rgba(0,0,0,.4); }
.ck-pips { display: flex; gap: calc(var(--px) * 1.5); flex-wrap: wrap; justify-content: center; }
.ck-pip { font-size: .62em; font-weight: 700; letter-spacing: .08em; padding: calc(var(--px) * .5) calc(var(--px) * 2.5); background: rgba(26,16,12,.82); color: #b8a080; border: var(--px) solid #000; box-shadow: inset 0 0 0 var(--px) #4a3020; text-transform: uppercase; }
.ck-pip.cur { background: var(--gold); color: var(--ink); box-shadow: inset 0 calc(var(--px) * -1) 0 var(--gold-dk); transform: translateY(calc(var(--px) * 1)); }
.ck-pip.done { color: var(--text-light); }
.ck-pip i { font-style: normal; margin-left: var(--px); }
.ck-timer { width: calc(var(--px) * 70); height: calc(var(--px) * 3); background: #1a1210; border: var(--px) solid #000; position: relative; overflow: hidden; }
.ck-timer > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--energy); box-shadow: inset 0 calc(var(--px) * -1) 0 var(--energy-dk); }
.ck-timer.low > i { background: var(--danger); box-shadow: none; animation: blink .4s steps(2) infinite; }
.ck-hint { position: absolute; left: 50%; bottom: calc(var(--px) * 6 + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
  background: rgba(20, 12, 10, .9); border: var(--px) solid #000; box-shadow: inset 0 0 0 var(--px) var(--wood); color: var(--text-light);
  padding: calc(var(--px) * 2) calc(var(--px) * 5); font-size: .95em; white-space: nowrap; animation: ckHintIn .3s ease-out; }
.ck-hint kbd { font-size: .85em; }
@keyframes ckHintIn { from { transform: translate(-50%, calc(var(--px) * 8)); opacity: 0; } }
.ck-esc { position: absolute; left: calc(var(--px) * 4); bottom: calc(var(--px) * 4); font-size: .62em; opacity: .7; text-shadow: 0 var(--px) 0 #000; }

/* big words */
.ck-big { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); text-align: center; white-space: nowrap; pointer-events: none; }
.ck-word { font-family: var(--font-display); line-height: .85; letter-spacing: .02em; color: var(--gold); display: inline-block;
  text-shadow: 0 calc(var(--px) * 2) 0 var(--gold-dk), 0 calc(var(--px) * 4) 0 var(--wood-dk), calc(var(--px) * 2) 0 0 var(--wood-dk), calc(var(--px) * -2) 0 0 var(--wood-dk), 0 calc(var(--px) * -2) 0 var(--wood-dk), 0 calc(var(--px) * 7) 0 rgba(0,0,0,.4); }
.ck-title .ck-word { font-size: calc(var(--px) * 30); animation: ckTitle 1.1s cubic-bezier(.2,1.6,.4,1) forwards; }
.ck-title .ck-sub { display: block; font-size: calc(var(--px) * 6); color: var(--text-light); text-shadow: 0 var(--px) 0 #000, var(--px) 0 0 #000, calc(var(--px)*-1) 0 0 #000; margin-bottom: calc(var(--px) * 2); animation: ckFadeUp 1.1s ease-out forwards; }
@keyframes ckTitle { 0% { transform: scale(.2) rotate(-8deg); opacity: 0; } 25% { transform: scale(1.15) rotate(3deg); opacity: 1; } 40% { transform: scale(.96) rotate(-1deg); } 55% { transform: scale(1); } 85% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.1) translateY(calc(var(--px) * -10)); opacity: 0; } }
@keyframes ckFadeUp { 0% { opacity: 0; transform: translateY(calc(var(--px) * 4)); } 20%, 85% { opacity: 1; transform: none; } 100% { opacity: 0; } }
.ck-fb .ck-word { font-size: calc(var(--px) * 36); animation: ckFb 1.35s cubic-bezier(.2,1.7,.35,1) forwards; }
.ck-fb.great .ck-word { color: #9af07a; text-shadow: 0 calc(var(--px) * 2) 0 #3a8a2a, 0 calc(var(--px) * 4) 0 #1a3a12, calc(var(--px) * 2) 0 0 #1a3a12, calc(var(--px) * -2) 0 0 #1a3a12, 0 calc(var(--px) * -2) 0 #1a3a12, 0 calc(var(--px) * 7) 0 rgba(0,0,0,.4); }
.ck-fb.good .ck-word { color: #9fdcff; font-size: calc(var(--px) * 30); text-shadow: 0 calc(var(--px) * 2) 0 #3a7ab8, 0 calc(var(--px) * 4) 0 #12304a, calc(var(--px) * 2) 0 0 #12304a, calc(var(--px) * -2) 0 0 #12304a, 0 calc(var(--px) * -2) 0 #12304a, 0 calc(var(--px) * 7) 0 rgba(0,0,0,.4); }
.ck-fb.oops .ck-word { color: #ff9a8a; font-size: calc(var(--px) * 30); animation: ckOops 1.35s ease-out forwards; text-shadow: 0 calc(var(--px) * 2) 0 #a83a2a, 0 calc(var(--px) * 4) 0 #3a1010, calc(var(--px) * 2) 0 0 #3a1010, calc(var(--px) * -2) 0 0 #3a1010, 0 calc(var(--px) * -2) 0 #3a1010, 0 calc(var(--px) * 7) 0 rgba(0,0,0,.4); }
.ck-fb.perfect .ck-word { animation: ckFb 1.35s cubic-bezier(.2,1.7,.35,1) forwards, ckRainbow .5s steps(4) infinite; }
.ck-fb .ck-pts { display: block; font-family: var(--font-display); font-size: calc(var(--px) * 9); color: var(--text-light); margin-top: calc(var(--px) * 2); text-shadow: 0 var(--px) 0 #000, var(--px) 0 0 #000, calc(var(--px)*-1) 0 0 #000, 0 calc(var(--px)*-1) 0 #000; animation: ckFadeUp 1.35s ease-out forwards; }
@keyframes ckFb { 0% { transform: scale(.1) rotate(-12deg); opacity: 0; } 18% { transform: scale(1.3) rotate(4deg); opacity: 1; } 30% { transform: scale(.88) rotate(-2deg); } 42% { transform: scale(1.06) rotate(1deg); } 54% { transform: scale(1) rotate(0); } 85% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.15) translateY(calc(var(--px) * -14)); opacity: 0; } }
@keyframes ckOops { 0% { transform: scale(.4); opacity: 0; } 15% { transform: scale(1.1); opacity: 1; } 22% { transform: translateX(calc(var(--px) * -4)) rotate(-4deg); } 30% { transform: translateX(calc(var(--px) * 4)) rotate(4deg); } 38% { transform: translateX(calc(var(--px) * -3)) rotate(-2deg); } 46% { transform: none; } 85% { opacity: 1; transform: translateY(calc(var(--px) * 3)); } 100% { opacity: 0; transform: translateY(calc(var(--px) * 12)); } }
@keyframes ckRainbow { 0% { color: #ffe066; } 25% { color: #ffb0e0; } 50% { color: #a0f0ff; } 75% { color: #c0ff9a; } }
.ck-star { position: absolute; width: calc(var(--px) * 4); height: calc(var(--px) * 4); background: #fff6b0; box-shadow: 0 0 0 var(--px) #ffd84a; animation: ckStar .9s ease-out forwards; }
@keyframes ckStar { from { transform: translate(0, 0) scale(1.4) rotate(0); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) scale(.2) rotate(180deg); opacity: 0; } }

/* meters */
.ck-gauge { position: absolute; right: calc(var(--px) * 10); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--px) * 2); animation: ckGaugeIn .3s cubic-bezier(.2,1.4,.4,1); }
@keyframes ckGaugeIn { from { transform: translate(calc(var(--px) * 30), -50%); opacity: 0; } }
.ck-gauge .lbl { font-size: .62em; font-weight: 700; color: var(--text-light); text-shadow: 0 var(--px) 0 #000; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
.ck-track { position: relative; width: calc(var(--px) * 12); height: min(calc(var(--px) * 92), 46vh); background: #2a1a12; border: var(--px) solid #000; box-shadow: inset 0 0 0 var(--px) #4a3020, 0 calc(var(--px) * 2) 0 rgba(0,0,0,.4); }
.ck-track .zone { position: absolute; left: var(--px); right: var(--px); background: rgba(138, 224, 90, .35); border-top: var(--px) dashed #9af07a; border-bottom: var(--px) dashed #9af07a; }
.ck-track .zone.sweet { background: rgba(255, 216, 74, .4); border-color: #ffe066; }
.ck-track .fill { position: absolute; left: calc(var(--px) * 2); right: calc(var(--px) * 2); bottom: calc(var(--px) * 1); background: var(--parch); box-shadow: inset calc(var(--px) * -1) 0 0 rgba(0,0,0,.2); }
.ck-track .mark { position: absolute; left: calc(var(--px) * -4); right: calc(var(--px) * -4); height: calc(var(--px) * 2); background: #fff; box-shadow: 0 0 0 var(--px) #000; transform: translateY(50%); }
.ck-track .mark::after { content: ''; position: absolute; right: calc(var(--px) * -4); top: 50%; transform: translateY(-50%); border: calc(var(--px) * 3) solid transparent; border-right-color: #fff; }
.ck-gauge .btn { font-size: .85em; margin-top: calc(var(--px) * 2); }
.ck-done { position: absolute; left: 50%; top: calc(var(--px) * 30); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--px) * 1.5); }
.ck-hbar { position: relative; width: min(calc(var(--px) * 120), 60vw); height: calc(var(--px) * 9); border: var(--px) solid #000; box-shadow: inset 0 0 0 var(--px) rgba(255,255,255,.2), 0 calc(var(--px) * 2) 0 rgba(0,0,0,.4);
  background: linear-gradient(90deg, #f0e2c0 0%, #f0d890 35%, #e0a040 52%, #c8782a 68%, #6a3a1a 85%, #2a1a12 100%); }
.ck-hbar .win { position: absolute; top: calc(var(--px) * -2); bottom: calc(var(--px) * -2); border: var(--px) solid #fff; box-shadow: 0 0 0 var(--px) #000; }
.ck-hbar .mark { position: absolute; top: calc(var(--px) * -4); bottom: calc(var(--px) * -4); width: calc(var(--px) * 2); background: #fff; box-shadow: 0 0 0 var(--px) #000; transform: translateX(-50%); }
.ck-hbar .side { position: absolute; left: calc(var(--px) * -24); top: 50%; transform: translateY(-50%); font-size: .6em; font-weight: 700; color: var(--text-light); text-shadow: 0 var(--px) 0 #000; white-space: nowrap; }
.ck-flips { font-size: .7em; color: var(--text-light); text-shadow: 0 var(--px) 0 #000; }
.ck-lane { position: absolute; left: 50%; bottom: calc(var(--px) * 22); transform: translateX(-50%); width: min(calc(var(--px) * 160), 80vw); height: calc(var(--px) * 20); background: rgba(20,12,10,.78); border: var(--px) solid #000; box-shadow: inset 0 0 0 var(--px) var(--wood); overflow: hidden; }
.ck-lane .hit { position: absolute; left: calc(var(--px) * 18); top: calc(var(--px) * 1); bottom: calc(var(--px) * 1); width: calc(var(--px) * 16); border: var(--px) solid var(--gold); box-shadow: inset 0 0 0 var(--px) var(--gold-dk); transform: translateX(-50%); }
.ck-lane .hit.flash { background: rgba(255,216,74,.45); }
.ck-note { position: absolute; top: 50%; width: calc(var(--px) * 14); height: calc(var(--px) * 14); transform: translate(-50%, -50%); display: grid; place-items: center; font-family: var(--font-display); font-size: 1.2em; color: var(--ink); border: var(--px) solid #000; }
.ck-note.L { background: #9fdcff; box-shadow: inset 0 calc(var(--px) * -2) 0 #3a7ab8; }
.ck-note.R { background: #ffb0c8; box-shadow: inset 0 calc(var(--px) * -2) 0 #c84a7a; }
.ck-note.ok { opacity: 0; transform: translate(-50%, -90%) scale(1.5); transition: all .2s; }
.ck-note.miss { filter: grayscale(1) brightness(.6); }
.ck-float { position: absolute; transform: translate(-50%, -50%); font-family: var(--font-display); font-size: calc(var(--px) * 9); white-space: nowrap; pointer-events: none;
  text-shadow: 0 var(--px) 0 #000, var(--px) 0 0 #000, calc(var(--px) * -1) 0 0 #000, 0 calc(var(--px) * -1) 0 #000; animation: ckFloat .9s ease-out forwards; }
@keyframes ckFloat { 0% { transform: translate(-50%, -50%) scale(.5); } 20% { transform: translate(-50%, -60%) scale(1.15); } 100% { transform: translate(-50%, calc(-50% - var(--px) * 14)) scale(1); opacity: 0; } }

/* ---------- result ---------- */
.ck-result { align-items: center; text-align: center; overflow: hidden; bottom: auto; right: auto; left: calc(var(--px) * 5); top: calc(var(--px) * 56); max-height: calc(100vh - var(--px) * 61); animation: ckSlideInL .32s cubic-bezier(.2,1.3,.4,1); }
.ck-result .scroll { overflow-y: auto; }
@keyframes ckSlideInL { from { transform: translateX(calc(-100% - var(--px) * 10)); } }
.ck-result .scroll { width: 100%; display: flex; flex-direction: column; align-items: center; }
.ck-reveal { position: relative; width: calc(var(--icon) * 2); height: calc(var(--icon) * 2); display: grid; place-items: center; margin: calc(var(--px) * 1) 0 calc(var(--px) * 2); }
.ck-rays { position: absolute; inset: calc(var(--px) * -10); background: repeating-conic-gradient(rgba(242,194,58,.45) 0 10deg, transparent 10deg 20deg); border-radius: 50%; animation: ckSpin 8s linear infinite; -webkit-mask: radial-gradient(circle, #000 35%, transparent 70%); mask: radial-gradient(circle, #000 35%, transparent 70%); }
@keyframes ckSpin { to { transform: rotate(360deg); } }
.ck-reveal img { position: relative; width: 100%; height: 100%; animation: ckRevealPop .7s cubic-bezier(.2,1.7,.35,1); filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(0,0,0,.25)); }
@keyframes ckRevealPop { 0% { transform: scale(0) rotate(-30deg); } 60% { transform: scale(1.18) rotate(6deg); } 100% { transform: scale(1); } }
.ck-dname { font-family: var(--font-display); font-size: 2.2em; line-height: 1; color: var(--wood-dk); margin: 0; }
.ck-new { display: inline-block; font-size: .62em; font-weight: 700; letter-spacing: .12em; color: #fff; background: var(--danger); padding: 0 calc(var(--px) * 2); border: var(--px) solid var(--wood-dk); transform: rotate(-4deg); margin-bottom: calc(var(--px) * 1); animation: ckBop .4s cubic-bezier(.2,1.8,.4,1); }
.ck-grade { font-family: var(--font-display); font-size: 2.6em; line-height: 1; margin: calc(var(--px) * 1) 0; animation: ckStamp .5s cubic-bezier(.2,1.6,.4,1) .35s both; }
@keyframes ckStamp { 0% { transform: scale(3) rotate(-12deg); opacity: 0; } 100% { transform: scale(1) rotate(-3deg); opacity: 1; } }
.ck-grade small { font-family: var(--font); font-size: .32em; color: var(--ink-soft); display: block; }
.ck-stats { display: flex; gap: calc(var(--px) * 2); flex-wrap: wrap; justify-content: center; margin: calc(var(--px) * 1) 0; }
.ck-stat { background: var(--parch-2); border: var(--px) solid var(--parch-3); padding: calc(var(--px) * 1) calc(var(--px) * 3); font-size: .8em; display: flex; align-items: center; gap: calc(var(--px) * 1.5); }
.ck-stat img { width: var(--icon-s); height: var(--icon-s); }
.ck-line { font-style: italic; color: var(--wood); margin: calc(var(--px) * 2) 0; font-size: .9em; max-width: 34ch; }
.ck-bars { display: flex; gap: calc(var(--px) * 1.5); justify-content: center; margin-bottom: calc(var(--px) * 1); flex-wrap: wrap; }
.ck-bars span { font-size: .58em; padding: 0 calc(var(--px) * 1.5); border: var(--px) solid var(--parch-3); background: var(--parch-2); text-transform: uppercase; letter-spacing: .06em; }
.ck-actions { display: flex; gap: calc(var(--px) * 2); flex-wrap: wrap; justify-content: center; margin-top: calc(var(--px) * 2); }
/* 32px item art: keep every icon at a whole-number scale (1x / 2x / 3x) */
@media (min-width: 1700px) and (min-height: 1000px) { .ck-reveal { width: calc(var(--icon) * 3); height: calc(var(--icon) * 3); } }
/* phones held upright: the side panels become a bottom sheet across the whole width */
@media (max-aspect-ratio: 4/5) {
  .ck-side { left: calc(var(--px) * 4); right: calc(var(--px) * 4); width: auto; top: auto; bottom: calc(var(--px) * 4 + env(safe-area-inset-bottom, 0px)); max-height: 60vh; }
  .ck-tray { flex-wrap: wrap; }
  .ck-top { max-width: calc(100vw - var(--px) * 8); }
  .ck-leave { bottom: auto; top: calc(var(--px) * 4 + env(safe-area-inset-top, 0px)); }
}
`;

let injected = false;
export function ensureStyles() {
  if (injected) return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'ck-styles';
  s.textContent = CSS;
  document.head.appendChild(s);
}
