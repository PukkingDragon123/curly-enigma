// Scoped styles for the cooking scene UI (injected once; all classes prefixed ck-). The art comes
// from ui/uiArt.js (--a-wood, --a-sign, --a-note, --a-slate...) and cooking/kitchenArt.js (--a-ck-*),
// always at a whole multiple of --px. Text is Tiny5 at 16px (24px on big screens) and the pixel
// heading fonts at their own sizes, so it stays crisp.
const CSS = /* css */`
.ck-root { position: absolute; inset: 0; pointer-events: none; font-family: var(--font); }
.ck-root .interactive, .ck-root button { pointer-events: auto; }
.ck-root img { image-rendering: pixelated; image-rendering: crisp-edges; -webkit-user-drag: none; }
.ck-root button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
@keyframes ckSwing { 0%, 100% { transform: rotate(-.8deg); } 50% { transform: rotate(.8deg); } }
@keyframes ckSwingHit { 0% { transform: rotate(0); } 25% { transform: rotate(-5deg); } 55% { transform: rotate(3deg); } 80% { transform: rotate(-1.5deg); } 100% { transform: rotate(0); } }

/* ---------- the pantry: a cupboard under a hanging sign, the pot and the bell below ---------- */
.ck-side { position: absolute; right: calc(var(--px) * 4 + var(--sar)); top: calc(var(--px) * 34 + var(--sat)); bottom: calc(var(--px) * 4 + var(--sab));
  width: min(calc(var(--px) * 172), calc(50vw - var(--px) * 6)); display: flex; flex-direction: column; color: var(--ink); font-size: 16px; line-height: 1.25;
  animation: ckSlideIn .32s cubic-bezier(.2,1.3,.4,1); }
.ck-side.out { animation: ckSlideOut .25s ease-in forwards; }
.ck-pantry { top: calc(var(--px) * 26 + var(--sat)); }
@keyframes ckSlideIn { from { transform: translateX(calc(100% + var(--px) * 10)); } }
@keyframes ckSlideOut { to { transform: translateX(calc(100% + var(--px) * 10)); } }

.ck-sign { position: relative; z-index: 2; align-self: center; flex: none; margin-bottom: calc(var(--px) * -7); max-width: calc(100% - var(--px) * 30);
  border-style: solid; border-width: calc(var(--px) * 6); border-image: var(--a-sign) 6 fill / calc(var(--px) * 6) stretch;
  padding: 0 calc(var(--px) * 5); filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(8, 4, 6, .5));
  transform-origin: 50% -60px; animation: ckSwing 4.5s ease-in-out infinite; }
.ck-sign h2 { margin: 0; font-family: var(--font-script); font-weight: 400; font-size: var(--fs-s); line-height: 1.05; color: #ffe4b0; white-space: nowrap;
  text-shadow: 0 var(--px) 0 #2a160a, 0 calc(var(--px) * -1) 0 rgba(0, 0, 0, .25); }
.ck-chain { position: absolute; bottom: 100%; width: calc(var(--px) * 4); height: 60px; background: var(--a-chain) 0 100% / calc(var(--px) * 4) calc(var(--px) * 8) repeat-y; }
.ck-chain.l { left: calc(var(--px) * 3); }
.ck-chain.r { right: calc(var(--px) * 3); }

.ck-cupboard { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column;
  border-style: solid; border-width: calc(var(--px) * 7); border-image: var(--a-wood) 7 / calc(var(--px) * 7) repeat;
  background: var(--a-woodDkT) 0 0 / calc(var(--px) * 32) calc(var(--px) * 20) repeat padding-box, #52321a padding-box;
  padding: calc(var(--px) * 7) calc(var(--px) * 2) calc(var(--px) * 2); filter: drop-shadow(0 calc(var(--px) * 3) 0 rgba(8, 4, 6, .5)); }
.ck-tabs { display: flex; gap: calc(var(--px) * 2); flex: none; padding: 0 calc(var(--px) * 1) calc(var(--px) * 3); flex-wrap: wrap; }
.ck-tab { display: inline-flex; align-items: center; gap: calc(var(--px) * 2);
  font: inherit; font-size: 16px; line-height: 1; cursor: pointer; color: #f6e2c0; padding: calc(var(--px) * 1.5) calc(var(--px) * 3) calc(var(--px) * 2.5);
  border: var(--px) solid transparent; border-image: var(--a-cut) 1 / var(--px) stretch;
  background: linear-gradient(to bottom, #b07a46 0 var(--px), #8a5a32 var(--px) calc(100% - var(--px) * 2), #5e3a1f calc(100% - var(--px) * 2)) padding-box;
  text-shadow: 0 var(--px) 0 #2a160a; transition: transform .12s var(--pop); }
.ck-tab:hover { transform: translateY(calc(var(--px) * -1)); }
.ck-tab.on { color: var(--ink); text-shadow: none; background: linear-gradient(to bottom, #fff3c0 0 var(--px), #e8be5a var(--px) calc(100% - var(--px) * 2), #a8772c calc(100% - var(--px) * 2)) padding-box; }
.ck-tab-ic { width: calc(var(--px) * 11); height: calc(var(--px) * 11); margin: calc(var(--px) * -2) 0; }
.ck-tab-n { font-weight: 400; min-width: calc(var(--px) * 5); padding: 0 var(--px); text-align: center; color: var(--ink); background: #f8ecd2; box-shadow: 0 0 0 var(--px) var(--paper-edge); }
.ck-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: #a06c3c transparent; overscroll-behavior: contain; touch-action: pan-y;
  background: rgba(20, 10, 4, .3); box-shadow: inset 0 0 0 var(--px) #26160c, inset 0 calc(var(--px) * 4) 0 rgba(0, 0, 0, .3); }

/* shelves: a brass name plate, then rows of goods standing on planks */
.ck-shelf { position: relative; padding-top: calc(var(--px) * 3); }
.ck-plate { position: relative; display: table; margin: 0 auto calc(var(--px) * 1); padding: var(--px) calc(var(--px) * 5) calc(var(--px) * 1.5);
  font-size: 16px; line-height: 1; color: #4a2c0a; white-space: nowrap;
  background: linear-gradient(to bottom, #fff3c0 0 var(--px), #f2c96a var(--px) calc(100% - var(--px) * 2), #a8772c calc(100% - var(--px) * 2));
  box-shadow: 0 0 0 var(--px) #3a2410, 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .35); }
.ck-plate::before, .ck-plate::after { content: ''; position: absolute; top: 50%; width: var(--px); height: var(--px); margin-top: calc(var(--px) * -.5); background: #6e4a1a; box-shadow: 0 var(--px) 0 #fff3c0; }
.ck-plate::before { left: calc(var(--px) * 2); }
.ck-plate::after { right: calc(var(--px) * 2); }
.ck-goods { --row: calc(var(--px) * 45); --top: calc(var(--px) * 31);
  display: grid; grid-template-columns: repeat(auto-fill, calc(var(--px) * 33)); grid-auto-rows: var(--row); justify-content: space-evenly; column-gap: var(--px);
  background-image: linear-gradient(to bottom, transparent 0 var(--top), #c08a52 var(--top) calc(var(--top) + var(--px)), #a06c3c 0 calc(var(--top) + var(--px) * 3), #83552e 0 calc(var(--top) + var(--px) * 5), #643e20 0 calc(var(--top) + var(--px) * 6), #26160c 0 calc(var(--top) + var(--px) * 7), rgba(0, 0, 0, .4) 0 calc(var(--top) + var(--px) * 9), rgba(0, 0, 0, .18) 0 calc(var(--top) + var(--px) * 11), transparent 0);
  background-size: 100% var(--row); padding-bottom: calc(var(--px) * 5); background-repeat: repeat-y; }
.ck-good { position: relative; height: var(--row); padding: 0; border: 0; background: none; cursor: pointer; font: inherit; color: inherit; outline: none;
  animation: ckGoodIn .4s var(--pop) var(--d, 0ms) both; }
.ck-scroll:not(.intro) .ck-good { animation: none; }
@keyframes ckGoodIn { from { transform: translateY(calc(var(--px) * -10)); opacity: 0; } 60% { opacity: 1; } }
.ck-cont { position: absolute; left: 50%; top: 0; width: calc(var(--px) * 30); height: calc(var(--px) * 30); margin-left: calc(var(--px) * -15); transition: transform .15s var(--pop), filter .15s; }
.ck-cont > .ck-c-back, .ck-cont > .ck-c-front { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.ck-c-item { position: absolute; left: 50%; width: var(--icon); height: var(--icon); translate: -50% 0; bottom: calc(var(--px) * 14 - var(--icon) * .35); transition: transform .18s var(--pop); filter: drop-shadow(0 var(--px) 0 rgba(0, 0, 0, .35)); }
.ck-good.jar .ck-c-item { bottom: calc(var(--px) * 12 - var(--icon) * .5); filter: none; }
.ck-good:hover .ck-c-item, .ck-good:focus-visible .ck-c-item { transform: translateY(calc(var(--px) * -3)); }
.ck-good.jar:hover .ck-c-item, .ck-good.jar:focus-visible .ck-c-item { transform: none; }
.ck-good.jar:hover .ck-cont, .ck-good.jar:focus-visible .ck-cont { transform: translateY(calc(var(--px) * -2)) rotate(-3deg); }
.ck-good.on .ck-cont { transform: translateY(calc(var(--px) * -2)); filter: drop-shadow(0 0 var(--px) #ffe08a) drop-shadow(0 0 var(--px) #ffe08a); }
.ck-good.on .ck-c-item { animation: ckHop 1.6s ease-in-out infinite; }
.ck-good.jar.on .ck-c-item { animation: none; }
@keyframes ckHop { 0%, 60%, 100% { transform: translateY(calc(var(--px) * -2)); } 75% { transform: translateY(calc(var(--px) * -5)); } }
.ck-good:focus-visible .ck-tag { outline: var(--px) solid var(--gold); outline-offset: var(--px); }
.ck-q { position: absolute; left: calc(var(--px) * -1); top: calc(var(--px) * 3); z-index: 1; min-width: calc(var(--px) * 7); padding: var(--px) calc(var(--px) * .5) 0; font-size: 16px; line-height: 1; color: #fff; text-align: center; box-shadow: 0 0 0 var(--px) #2a1a12; }
.ck-q.p::after { content: '★'; margin-left: 1px; color: #fff6b0; }
.ck-tag { position: absolute; left: 50%; top: calc(var(--top) + var(--px) * 8); translate: -50% 0; display: flex; align-items: center; gap: var(--px); white-space: nowrap;
  font-size: 16px; line-height: 1; color: var(--ink); background: #f8ecd2; padding: var(--px) calc(var(--px) * 2);
  box-shadow: 0 0 0 var(--px) var(--paper-edge), 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .35); transform-origin: 50% calc(var(--px) * -4); }
.ck-tag::before { content: ''; position: absolute; left: 50%; top: calc(var(--px) * -4); width: var(--px); height: calc(var(--px) * 3); background: #c8a878; }
.ck-good:hover .ck-tag { animation: ckTagWiggle .6s ease-in-out; }
@keyframes ckTagWiggle { 25% { transform: rotate(6deg); } 60% { transform: rotate(-4deg); } }
.ck-good.on .ck-tag { background: #ffe8a0; box-shadow: 0 0 0 var(--px) #8a5a10, 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .35); }
.ck-tag-ok { height: calc(var(--px) * 9); width: auto; margin: calc(var(--px) * -2) 0 calc(var(--px) * -2) calc(var(--px) * -1); }
.ck-empty { display: flex; flex-direction: column; align-items: center; gap: calc(var(--px) * 3); color: #f0d8b0; text-align: center; padding: calc(var(--px) * 8) calc(var(--px) * 4); text-shadow: 0 var(--px) 0 #1a0c04; }
.ck-empty p { margin: 0; line-height: 1.35; }
.ck-empty-art { width: calc(var(--px) * 30); height: calc(var(--px) * 30); opacity: .8; }

/* the recipe box: card dividers, the front card, the box's front plank */
.ck-rbox { display: flex; flex-direction: column; min-height: 100%; padding: calc(var(--px) * 4) calc(var(--px) * 2) 0; }
.ck-rtabs { position: relative; display: flex; justify-content: safe center; gap: var(--px); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior: contain; touch-action: pan-x;
  padding: calc(var(--px) * 4) calc(var(--px) * 3) calc(var(--px) * 1); }
.ck-rtabs::-webkit-scrollbar { display: none; }
.ck-rtab { flex: none; }
.ck-rtab { position: relative; display: grid; place-items: center; width: calc(var(--icon-s) + var(--px) * 4); height: calc(var(--icon-s) + var(--px) * 4); padding: 0; border: 0; cursor: pointer;
  background: #f2e1b9; box-shadow: inset 0 calc(var(--px) * -1) 0 #d4b47e, 0 0 0 var(--px) var(--paper-edge); transition: transform .12s var(--pop); }
.ck-rtab img { width: var(--icon-s); height: var(--icon-s); }
.ck-rtab:hover { transform: translateY(calc(var(--px) * -2)); }
.ck-rtab.on { background: #fffaf0; transform: translateY(calc(var(--px) * -3)); box-shadow: inset 0 var(--px) 0 #e07a6a, 0 0 0 var(--px) var(--paper-edge), 0 0 0 calc(var(--px) * 2) var(--gold); }
.ck-rc-wrap { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: calc(var(--px) * 2); padding: calc(var(--px) * 2) 0 calc(var(--px) * 3); perspective: 700px; }
.ck-flipb { position: relative; width: calc(var(--px) * 12); height: calc(var(--px) * 16); padding: 0; border: 0; cursor: pointer; background: var(--a-ck-arrow) 0 0 / 100% 100% no-repeat; filter: drop-shadow(0 var(--px) 0 rgba(0, 0, 0, .5)); transition: transform .12s var(--pop); }
.ck-flipb.prev { transform: scaleX(-1); }
.ck-flipb::after { content: ''; position: absolute; inset: calc(var(--px) * -5) calc(var(--px) * -4); }
.ck-flipb.next:hover { transform: translateX(var(--px)); }
.ck-flipb.prev:hover { transform: scaleX(-1) translateX(var(--px)); }
.ck-flipb[disabled] { opacity: .35; cursor: default; transform: none; }
.ck-flipb.prev[disabled] { transform: scaleX(-1); }
.ck-rcard { position: relative; min-width: 0; color: var(--ink);
  border-style: solid; border-width: calc(var(--px) * 5); border-image: var(--a-ck-card) 5 fill / calc(var(--px) * 5) repeat;
  padding: 0 calc(var(--px) * 1); filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(20, 8, 4, .45)); transform-origin: 50% 100%; }
.ck-rcard.fwd { animation: ckFlipF .34s cubic-bezier(.2,1.2,.4,1); }
.ck-rcard.back { animation: ckFlipB .34s cubic-bezier(.2,1.2,.4,1); }
@keyframes ckFlipF { from { transform: rotateX(-75deg) translateY(calc(var(--px) * -6)); opacity: .2; } }
@keyframes ckFlipB { from { transform: rotateX(75deg) translateY(calc(var(--px) * 6)); opacity: .2; } }
.ck-rcard.blank { text-align: center; color: #7a5a3a; margin: calc(var(--px) * 4) calc(var(--px) * 6); }
.ck-rcard.blank p { margin: calc(var(--px) * 3) 0; line-height: 1.35; }
.ck-rc-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: calc(var(--px) * 3); align-items: center; }
.ck-rc-pic { box-sizing: border-box; display: grid; place-items: center; width: calc(var(--icon) + var(--px) * 8); height: calc(var(--icon) + var(--px) * 8);
  border-style: solid; border-width: calc(var(--px) * 4); border-image: var(--a-sketch) 4 / calc(var(--px) * 4) repeat; }
.ck-rc-pic img { width: var(--icon); height: var(--icon); }
.ck-rc-name { min-width: 0; }
.ck-rc-name b { display: block; font-family: var(--font-head); font-weight: 400; font-size: var(--fs-h); line-height: 1; color: var(--sepia); text-wrap: balance; }
.ck-buffchip { display: inline-block; margin-top: calc(var(--px) * 1.5); padding: var(--px) calc(var(--px) * 2) 0; font-size: 16px; line-height: 1; color: #2a1a12; box-shadow: 0 0 0 var(--px) #2a1a12; }
.ck-rc-best { display: flex; flex-direction: column; align-items: center; gap: var(--px); font-size: 16px; line-height: 1; }
.ck-ros-s { width: calc(var(--px) * 16); height: calc(var(--px) * 22); }
.ck-rc-row { display: flex; align-items: center; gap: calc(var(--px) * 2); margin-top: calc(var(--px) * 3); flex-wrap: wrap; }
.ck-rc-row > small { font-size: 16px; color: #9a6a3a; min-width: 5ch; }
.ck-rc-steps, .ck-rc-ings { display: flex; gap: calc(var(--px) * 1.5); flex-wrap: wrap; align-items: center; }
.ck-tok { font-style: normal; font-size: 16px; line-height: 1; padding: var(--px) calc(var(--px) * 2) calc(var(--px) * 1.5); color: #f6e2c0; white-space: nowrap;
  border: var(--px) solid transparent; border-image: var(--a-cut) 1 / var(--px) stretch; text-shadow: 0 var(--px) 0 #2a160a;
  background: linear-gradient(to bottom, #b07a46 0 var(--px), #8a5a32 var(--px) calc(100% - var(--px) * 1.5), #5e3a1f calc(100% - var(--px) * 1.5)) padding-box; }
.ck-rc-ing { position: relative; display: grid; place-items: center; width: calc(var(--icon-s) + var(--px) * 2); height: calc(var(--icon-s) + var(--px) * 2); background: #fffaf0; box-shadow: 0 0 0 var(--px) var(--parch-3); }
.ck-rc-ing img { width: var(--icon-s); height: var(--icon-s); }
.ck-rc-ing.no img { opacity: .35; filter: grayscale(1); }
.ck-rc-ing.no::after { content: ''; position: absolute; right: calc(var(--px) * -3); bottom: calc(var(--px) * -3); width: calc(var(--px) * 9); height: calc(var(--px) * 9); background: var(--a-sealX) center / 100% 100%; }
.ck-rc-row:last-child { margin-bottom: calc(var(--px) * 1); }
.ck-rc-use { font-size: 16px; margin-left: auto; }
.ck-rc-use:not([disabled]) { animation: ckPulse 1.4s ease-in-out infinite; }
.ck-rfront { margin: auto calc(var(--px) * -2) 0; padding: calc(var(--px) * 3) calc(var(--px) * 2) calc(var(--px) * 3); text-align: center;
  background: var(--a-woodT) 0 0 / calc(var(--px) * 32) calc(var(--px) * 16) repeat;
  box-shadow: inset 0 var(--px) 0 #d8a06a, inset 0 calc(var(--px) * 2) 0 #8a5a32, 0 calc(var(--px) * -2) 0 rgba(0, 0, 0, .35); }
.ck-rlabel { display: inline-block; padding: var(--px) calc(var(--px) * 4) calc(var(--px) * 1.5); font-size: 16px; line-height: 1.2; color: #4a2c0a;
  background: linear-gradient(to bottom, #fff3c0 0 var(--px), #f2c96a var(--px) calc(100% - var(--px) * 2), #a8772c calc(100% - var(--px) * 2));
  box-shadow: 0 0 0 var(--px) #3a2410, 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .35); }
.ck-rlabel b { font-family: var(--font-head); font-weight: 400; font-size: var(--fs-h); line-height: .8; color: #6a3a10; vertical-align: -.1em; }

/* the counter: a paper slip, the pot on the stove and the Cook! bell */
.ck-counter { position: relative; flex: none; display: flex; flex-direction: column; gap: calc(var(--px) * 1); margin-top: calc(var(--px) * 2);
  background: var(--a-woodT) 0 0 / calc(var(--px) * 32) calc(var(--px) * 16) repeat;
  box-shadow: inset 0 var(--px) 0 #d8a06a, inset 0 calc(var(--px) * 2) 0 #8a5a32, 0 0 0 var(--px) #26160c, 0 calc(var(--px) * 3) 0 rgba(0, 0, 0, .35);
  padding: calc(var(--px) * 5) calc(var(--px) * 3) calc(var(--px) * 1); }
.ck-info { position: relative; min-height: 1.25em; font-size: 16px; line-height: 1.25; color: #4a3020; background: #f8ecd2; margin: 0 calc(var(--px) * 2);
  padding: calc(var(--px) * 2) calc(var(--px) * 3) calc(var(--px) * 1.5) calc(var(--px) * 9);
  box-shadow: 0 0 0 var(--px) var(--paper-edge), inset 0 calc(var(--px) * -1) 0 #e2cc9c, 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .35); transform: rotate(-.6deg); }
.ck-info::before { content: ''; position: absolute; left: calc(var(--px) * 1); top: calc(var(--px) * -1); width: calc(var(--px) * 8); height: calc(var(--px) * 9); background: var(--a-tackRed) center / 100% 100%; }
.ck-info b { font-weight: 400; color: var(--sepia); }
.ck-info i { font-style: normal; color: #8a6a4a; }
.ck-sniff { display: block; margin-top: var(--px); color: #a8402a; }
.ck-stove { display: flex; align-items: flex-end; justify-content: space-between; gap: calc(var(--px) * 2); }
.ck-pot { position: relative; flex: none; width: calc(var(--px) * 120); height: calc(var(--px) * 46); margin-left: calc(var(--px) * 3); }
.ck-pot-stove { position: absolute; left: calc(var(--px) * -4); bottom: 0; width: calc(var(--px) * 128); height: calc(var(--px) * 10); opacity: .55; transition: opacity .4s; }
.ck-pot.full .ck-pot-stove { opacity: 1; animation: ckGlow 1.2s steps(3) infinite; }
@keyframes ckGlow { 50% { filter: brightness(1.25); } }
.ck-pot-back, .ck-pot-front { position: absolute; left: 0; bottom: calc(var(--px) * 2); width: calc(var(--px) * 120); height: calc(var(--px) * 44); pointer-events: none; }
.ck-pring { position: absolute; bottom: calc(var(--px) * 31); width: calc(var(--px) * 12); height: calc(var(--px) * 5); translate: -50% 0; background: var(--a-ck-ring) 0 0 / 100% 100%; animation: ckRing 2.4s ease-in-out infinite; }
@keyframes ckRing { 50% { opacity: .45; } }
.ck-pitem { position: absolute; bottom: calc(var(--px) * 23); width: var(--icon); height: var(--icon); padding: 0; border: 0; background: none; cursor: pointer; translate: -50% 0;
  animation: ckBob 2.4s ease-in-out infinite; animation-delay: calc(var(--i, 0) * -.6s); }
.ck-pitem img { display: block; width: 100%; height: 100%; }
.ck-pitem:hover { filter: drop-shadow(0 0 var(--px) #ffe08a) drop-shadow(0 0 var(--px) #ffe08a); }
.ck-pitem.drop { animation: ckDrop .55s cubic-bezier(.3, 1.3, .5, 1) both, ckBob 2.4s ease-in-out .55s infinite; }
.ck-pitem.drop::after { content: ''; position: absolute; left: 50%; bottom: calc(var(--px) * -2); width: var(--px); height: var(--px); background: #fff4d8; pointer-events: none;
  box-shadow: calc(var(--px) * -6) calc(var(--px) * -2) 0 #fff4d8, calc(var(--px) * 6) calc(var(--px) * -3) 0 #fff4d8, calc(var(--px) * -3) calc(var(--px) * -5) 0 #e8fff8, calc(var(--px) * 4) calc(var(--px) * -6) 0 #e8fff8, calc(var(--px) * -8) 0 0 #fff4d8, calc(var(--px) * 8) 0 0 #fff4d8;
  opacity: 0; animation: ckSplash .45s ease-out .3s; }
@keyframes ckDrop { 0% { transform: translateY(calc(var(--px) * -34)) rotate(-25deg); opacity: 0; } 25% { opacity: 1; } 65% { transform: translateY(calc(var(--px) * 3)) rotate(6deg); } 100% { transform: translateY(0) rotate(0); } }
@keyframes ckBob { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(var(--px)) rotate(3deg); } }
@keyframes ckSplash { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(calc(var(--px) * -6)); } }
.ck-steam { position: absolute; bottom: calc(var(--px) * 36); width: calc(var(--px) * 2); height: calc(var(--px) * 2); background: rgba(255, 248, 236, .75); pointer-events: none; opacity: 0;
  box-shadow: var(--px) calc(var(--px) * -3) 0 rgba(255, 248, 236, .55), calc(var(--px) * -1) calc(var(--px) * -6) 0 rgba(255, 248, 236, .35);
  animation: ckSteam 1.8s ease-out infinite; }
@keyframes ckSteam { 0% { transform: translateY(0); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(var(--px), calc(var(--px) * -14)); opacity: 0; } }
.ck-pot-n { position: absolute; right: calc(var(--px) * -2); bottom: 0; font-size: 16px; line-height: 1; padding: var(--px) calc(var(--px) * 1.5) 0; color: #4a2c0a;
  background: linear-gradient(to bottom, #fff3c0 0 var(--px), #f2c96a var(--px) calc(100% - var(--px)), #a8772c calc(100% - var(--px))); box-shadow: 0 0 0 var(--px) #3a2410; }
.ck-bell { position: relative; flex: none; display: flex; flex-direction: column; align-items: center; padding: 0; margin: 0 calc(var(--px) * 2) var(--px) 0; border: 0; background: none; cursor: pointer; font: inherit; color: inherit; outline: none; }
.ck-bell-img { width: calc(var(--px) * 36); height: calc(var(--px) * 30); filter: drop-shadow(0 var(--px) 0 rgba(0, 0, 0, .45)); transform-origin: 50% 85%; }
.ck-bell-lbl { position: relative; margin-top: calc(var(--px) * -1); font-family: var(--font-head); font-size: var(--fs-h); line-height: 1; color: #4a2008; white-space: nowrap;
  padding: calc(var(--px) * 1) calc(var(--px) * 4) calc(var(--px) * 1.5);
  background: linear-gradient(to bottom, #fff3c0 0 var(--px), #f7d97c var(--px) calc(var(--px) * 2), #e8be5a calc(var(--px) * 2) calc(100% - var(--px) * 2), #a8772c calc(100% - var(--px) * 2));
  box-shadow: 0 0 0 var(--px) #3a2410, 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .35); }
.ck-bell:hover .ck-bell-img { animation: ckBellWob .5s ease-in-out; }
.ck-bell:focus-visible .ck-bell-lbl { outline: var(--px) solid var(--gold); outline-offset: calc(var(--px) * 2); }
.ck-bell.ready .ck-bell-lbl { animation: ckPulse 1.2s ease-in-out infinite; }
.ck-bell.ready::before { content: ''; position: absolute; left: 50%; top: calc(var(--px) * 3); width: var(--px); height: var(--px); background: #fff6c8; pointer-events: none;
  box-shadow: calc(var(--px) * -14) calc(var(--px) * 6) 0 #fff6c8, calc(var(--px) * 13) calc(var(--px) * 4) 0 #fff6c8, calc(var(--px) * -9) calc(var(--px) * -1) 0 #ffe08a, calc(var(--px) * 10) calc(var(--px) * -2) 0 #ffe08a;
  animation: ckTwinkle 1.2s steps(2) infinite; }
@keyframes ckTwinkle { 50% { opacity: 0; } }
.ck-bell.ring .ck-bell-img { animation: ckBellRing .6s ease-out; }
.ck-bell.ring::after { content: ''; position: absolute; left: 50%; top: calc(var(--px) * 8); width: var(--px); height: calc(var(--px) * 4); background: #fff6c8; pointer-events: none;
  box-shadow: calc(var(--px) * -20) 0 0 #fff6c8, calc(var(--px) * 20) 0 0 #fff6c8, calc(var(--px) * -23) calc(var(--px) * 3) 0 #ffe08a, calc(var(--px) * 23) calc(var(--px) * 3) 0 #ffe08a;
  animation: ckFadeOut .6s ease-out forwards; }
.ck-bell[disabled] { cursor: default; }
.ck-bell[disabled] .ck-bell-img { filter: grayscale(.75) brightness(.8) drop-shadow(0 var(--px) 0 rgba(0, 0, 0, .45)); }
.ck-bell[disabled] .ck-bell-lbl { filter: grayscale(.8); opacity: .75; }
@keyframes ckBellWob { 30% { transform: rotate(-6deg); } 65% { transform: rotate(4deg); } }
@keyframes ckBellRing { 0% { transform: translateY(calc(var(--px) * 2)); } 20% { transform: rotate(-9deg); } 40% { transform: rotate(7deg); } 60% { transform: rotate(-4deg); } 80% { transform: rotate(2deg); } }
@keyframes ckFadeOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(1.3); } }
@keyframes ckPulse { 50% { transform: scale(1.06); } }

/* hanging plaques: back home (pantry) and stop (while cooking) */
.ck-leave, .ck-stop { position: absolute; left: calc(var(--px) * 5 + var(--sal)); bottom: calc(var(--px) * 5 + var(--sab)); display: flex; align-items: center; gap: calc(var(--px) * 2);
  padding: 0 calc(var(--px) * 2); font: inherit; font-size: 16px; line-height: 1; color: #ffe4b0; cursor: pointer; white-space: nowrap;
  border-style: solid; border-width: calc(var(--px) * 6); border-image: var(--a-sign) 6 fill / calc(var(--px) * 6) stretch; background: none;
  text-shadow: 0 var(--px) 0 #2a160a; filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(8, 4, 6, .5));
  transform-origin: 50% calc(var(--px) * -14); animation: ckSwing 5s ease-in-out infinite; }
.ck-leave:hover, .ck-stop:hover { animation: ckSwingHit .7s ease-out; filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(8, 4, 6, .5)) brightness(1.1); }
.ck-leave:active, .ck-stop:active { transform: translateY(var(--px)); }
.ck-leave:focus-visible, .ck-stop:focus-visible { outline: var(--px) solid var(--gold); outline-offset: calc(var(--px) * 2); }
.ck-hook { position: absolute; left: 50%; bottom: calc(100% + var(--px) * 5); width: calc(var(--px) * 24); height: calc(var(--px) * 10); margin-left: calc(var(--px) * -12); background: var(--a-ck-hanger) 0 0 / 100% 100%; pointer-events: none; }
.ck-plaque-ic { width: calc(var(--px) * 11); height: calc(var(--px) * 11); margin: calc(var(--px) * -2) 0; }
.ck-stop { opacity: .85; }
.ck-stop kbd { margin: 0 0 0 var(--px); }
.ck-stop[disabled] { display: none; }

/* ---------- step HUD: the order ticket, the kitchen timer, the chalk slate ---------- */
.ck-top { position: absolute; left: 50%; top: calc(var(--px) * 9 + var(--sat)); transform: translateX(-50%); display: flex; align-items: flex-start; gap: calc(var(--px) * 3);
  width: max-content; max-width: calc(100vw - var(--px) * 120); animation: ckTicketIn .45s var(--pop) both; }
@keyframes ckTicketIn { from { transform: translate(-50%, calc(var(--px) * -30)) rotate(-4deg); } }
.ck-ticket { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: calc(var(--px) * 2); color: var(--ink);
  border-style: solid; border-width: calc(var(--px) * 5); border-image: var(--a-note) 5 / calc(var(--px) * 5) repeat; background: #f8ecd2 padding-box;
  padding: 0 calc(var(--px) * 3) calc(var(--px) * 1); filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(8, 4, 6, .45)); transform-origin: 50% 0; animation: ckSway 3.4s ease-in-out infinite; }
@keyframes ckSway { 0%, 100% { transform: rotate(-.5deg); } 50% { transform: rotate(.5deg); } }
.ck-tack { position: absolute; left: 50%; top: calc(var(--px) * -9); width: calc(var(--px) * 8); height: calc(var(--px) * 9); margin-left: calc(var(--px) * -4); background: var(--a-tackRed) center / 100% 100%; z-index: 1; }
.ck-dish { font-family: var(--font-head); font-size: var(--fs-h); line-height: 1; color: var(--sepia); white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.ck-pips { display: flex; gap: calc(var(--px) * 2); flex-wrap: wrap; justify-content: center; }
.ck-pip { position: relative; display: inline-flex; align-items: center; gap: var(--px); font-size: 16px; line-height: 1; white-space: nowrap; color: #f6e2c0;
  padding: var(--px) calc(var(--px) * 2) calc(var(--px) * 1.5); border: var(--px) solid transparent; border-image: var(--a-cut) 1 / var(--px) stretch; text-shadow: 0 var(--px) 0 #2a160a;
  background: linear-gradient(to bottom, #b07a46 0 var(--px), #8a5a32 var(--px) calc(100% - var(--px) * 1.5), #5e3a1f calc(100% - var(--px) * 1.5)) padding-box; transition: transform .2s var(--pop); }
.ck-pip small { font-size: 16px; opacity: .6; }
.ck-pip.cur { color: var(--ink); text-shadow: none; transform: translateY(calc(var(--px) * -1)) scale(1.06);
  background: linear-gradient(to bottom, #fff3c0 0 var(--px), #e8be5a var(--px) calc(100% - var(--px) * 1.5), #a8772c calc(100% - var(--px) * 1.5)) padding-box; animation: ckCur 1s ease-in-out infinite; }
@keyframes ckCur { 50% { transform: translateY(calc(var(--px) * -2)) scale(1.06); } }
.ck-pip.done { color: #d8c0a0; background: linear-gradient(to bottom, #8a5a32 0 var(--px), #6a4224 var(--px) calc(100% - var(--px) * 1.5), #4a2c16 calc(100% - var(--px) * 1.5)) padding-box; }
.ck-pip.done { padding-right: calc(var(--px) * 5); }
.ck-pip .ck-stamp { position: absolute; right: calc(var(--px) * -5); top: calc(var(--px) * -6); height: calc(var(--px) * 9); width: auto; animation: ckStampIn .35s cubic-bezier(.3,1.6,.5,1) both; }
@keyframes ckStampIn { from { transform: scale(2.4) rotate(-20deg); opacity: 0; } }
.ck-timer { flex: none; width: calc(var(--px) * 22); height: calc(var(--px) * 24); margin-top: calc(var(--px) * 2); filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(8, 4, 6, .45)); transform-origin: 50% 80%; }
.ck-timer-img { display: block; width: 100%; height: 100%; }
.ck-timer.low { animation: ckRattle .24s steps(2) infinite; }
@keyframes ckRattle { 50% { transform: rotate(-7deg) translateX(-1px); } }
.ck-hint { position: absolute; left: 50%; bottom: calc(var(--px) * 6 + var(--sab)); transform: translateX(-50%); width: max-content; max-width: calc(100vw - var(--px) * 8); animation: ckHintIn .3s var(--pop); }
.ck-slate { font-size: var(--fs); line-height: 1.25; color: var(--chalk); text-align: center; white-space: nowrap;
  border-style: solid; border-width: calc(var(--px) * 5); border-image: var(--a-slate) 5 / calc(var(--px) * 5) stretch;
  background: var(--a-slateT) 0 0 / calc(var(--px) * 24) repeat padding-box, #38443f padding-box; padding: 0 calc(var(--px) * 3);
  text-shadow: 0 var(--px) 0 rgba(0, 0, 0, .45); filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(8, 4, 6, .45)); }
.ck-slate b { font-weight: 400; color: #fff3b0; }
.ck-slate kbd { font-size: 16px; }
@keyframes ckHintIn { from { transform: translate(-50%, calc(var(--px) * 8)); opacity: 0; } }

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
.ck-fb .ck-pts { display: flex; align-items: center; justify-content: center; gap: calc(var(--px) * 2); font-family: var(--font-display); font-size: calc(var(--px) * 9); color: var(--text-light); margin-top: calc(var(--px) * 2); text-shadow: 0 var(--px) 0 #000, var(--px) 0 0 #000, calc(var(--px)*-1) 0 0 #000, 0 calc(var(--px)*-1) 0 #000; animation: ckFadeUp 1.35s ease-out forwards; }
.ck-fb .ck-pts .ck-stamp { height: calc(var(--px) * 9); width: auto; }
@keyframes ckFb { 0% { transform: scale(.1) rotate(-12deg); opacity: 0; } 18% { transform: scale(1.3) rotate(4deg); opacity: 1; } 30% { transform: scale(.88) rotate(-2deg); } 42% { transform: scale(1.06) rotate(1deg); } 54% { transform: scale(1) rotate(0); } 85% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.15) translateY(calc(var(--px) * -14)); opacity: 0; } }
@keyframes ckOops { 0% { transform: scale(.4); opacity: 0; } 15% { transform: scale(1.1); opacity: 1; } 22% { transform: translateX(calc(var(--px) * -4)) rotate(-4deg); } 30% { transform: translateX(calc(var(--px) * 4)) rotate(4deg); } 38% { transform: translateX(calc(var(--px) * -3)) rotate(-2deg); } 46% { transform: none; } 85% { opacity: 1; transform: translateY(calc(var(--px) * 3)); } 100% { opacity: 0; transform: translateY(calc(var(--px) * 12)); } }
@keyframes ckRainbow { 0% { color: #ffe066; } 25% { color: #ffb0e0; } 50% { color: #a0f0ff; } 75% { color: #c0ff9a; } }
.ck-star { position: absolute; width: calc(var(--px) * 4); height: calc(var(--px) * 4); background: #fff6b0; box-shadow: 0 0 0 var(--px) #ffd84a; animation: ckStar .9s ease-out forwards; }
@keyframes ckStar { from { transform: translate(0, 0) scale(1.4) rotate(0); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) scale(.2) rotate(180deg); opacity: 0; } }
.ck-float { position: absolute; transform: translate(-50%, -50%); font-family: var(--font-display); font-size: calc(var(--px) * 9); white-space: nowrap; pointer-events: none;
  text-shadow: 0 var(--px) 0 #000, var(--px) 0 0 #000, calc(var(--px) * -1) 0 0 #000, 0 calc(var(--px) * -1) 0 #000; animation: ckFloat .9s ease-out forwards; }
@keyframes ckFloat { 0% { transform: translate(-50%, -50%) scale(.5); } 20% { transform: translate(-50%, -60%) scale(1.15); } 100% { transform: translate(-50%, calc(-50% - var(--px) * 14)) scale(1); opacity: 0; } }

/* ---------- meters: glass tubes on a notched plank, the doneness bar, the kneading board ---------- */
.ck-gauge { position: absolute; right: calc(var(--px) * 8 + var(--sar)); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--px) * 3); animation: ckGaugeIn .3s cubic-bezier(.2,1.4,.4,1); }
@keyframes ckGaugeIn { from { transform: translate(calc(var(--px) * 30), -50%); opacity: 0; } }
.ck-gauge .lbl, .ck-roll .lbl, .ck-done .side { position: relative; font-size: 16px; line-height: 1; white-space: nowrap; color: var(--ink); background: #f8ecd2; padding: var(--px) calc(var(--px) * 2) calc(var(--px) * .5);
  box-shadow: 0 0 0 var(--px) var(--paper-edge), 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .35); }
.ck-gauge .lbl.top { color: #8a2418; background: #ffe6d8; }
.ck-plank { position: relative; box-sizing: border-box; height: min(calc(var(--px) * 92), 46vh); width: calc(var(--px) * 28); padding: 0 calc(var(--px) * 3) 0 calc(var(--px) * 9);
  background: repeating-linear-gradient(to top, transparent 0 calc(10% - var(--px)), #3a2212 calc(10% - var(--px)) 10%) calc(var(--px) * 2) calc(var(--px) * 5) / calc(var(--px) * 4) calc(100% - var(--px) * 10) no-repeat,
    var(--a-woodT) 0 0 / calc(var(--px) * 32) calc(var(--px) * 16) repeat;
  box-shadow: inset var(--px) var(--px) 0 #c08a52, inset calc(var(--px) * -1) calc(var(--px) * -1) 0 #482b15, 0 0 0 var(--px) #26160c, 0 calc(var(--px) * 3) 0 rgba(0, 0, 0, .4); }
.ck-plank .notch { position: absolute; left: calc(var(--px) * 2); width: calc(var(--px) * 5); background: rgba(154, 240, 122, .85); box-shadow: 0 0 0 var(--px) #1a3a12; }
.ck-plank .notch.sweet { background: rgba(255, 224, 102, .9); box-shadow: 0 0 0 var(--px) #5a3a08; }
.ck-plank .mark { position: absolute; right: calc(var(--px) * -6); width: calc(var(--px) * 8); height: calc(var(--px) * 7); transform: translateY(50%); background: var(--a-ck-pointer) 0 0 / 100% 100%; filter: drop-shadow(0 var(--px) 0 rgba(0, 0, 0, .45)); }
.ck-track { position: relative; box-sizing: border-box; width: calc(var(--px) * 16); height: 100%;
  border-style: solid; border-width: calc(var(--px) * 5); border-image: var(--a-ck-tube) 5 / calc(var(--px) * 5) stretch;
  background: linear-gradient(90deg, rgba(255, 255, 255, .14) 0 var(--px), transparent var(--px)) padding-box, #24160e padding-box; }
.ck-track .zone { position: absolute; left: 0; right: 0; background: rgba(138, 224, 90, .3); box-shadow: inset 0 var(--px) 0 #9af07a, inset 0 calc(var(--px) * -1) 0 #9af07a; }
.ck-track .zone.sweet { background: rgba(255, 216, 74, .35); box-shadow: inset 0 var(--px) 0 #ffe066, inset 0 calc(var(--px) * -1) 0 #ffe066; }
.ck-track .fill { position: absolute; left: 0; right: 0; bottom: 0; height: 0;
  background: linear-gradient(90deg, rgba(255, 255, 255, .4) 0 var(--px), transparent var(--px) calc(100% - var(--px)), rgba(0, 0, 0, .28) calc(100% - var(--px))), var(--liq, #f3e2bf);
  box-shadow: inset 0 var(--px) 0 rgba(255, 255, 255, .65); }
.ck-track .ticks { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(to top, transparent 0 calc(20% - var(--px)), rgba(255, 255, 255, .4) calc(20% - var(--px)) 20%) 0 0 / 50% 100% no-repeat; }
.ck-gauge .btn { font-size: 16px; }
.ck-done { position: absolute; left: 50%; top: calc(var(--px) * 58 + var(--sat)); transform: translateX(-50%); width: max-content; max-width: calc(100vw - var(--px) * 8); display: grid; grid-template-columns: auto auto; align-items: center; justify-items: center; gap: calc(var(--px) * 3) calc(var(--px) * 4); animation: ckHintIn .3s var(--pop); }
.ck-hbar { position: relative; width: min(calc(var(--px) * 120), 56vw); height: calc(var(--px) * 9);
  border-style: solid; border-width: calc(var(--px) * 3); border-image: var(--a-ck-bar) 3 / calc(var(--px) * 3) stretch;
  background: linear-gradient(90deg, #f0e2c0 0%, #f0d890 35%, #e0a040 52%, #c8782a 68%, #6a3a1a 85%, #2a1a12 100%) padding-box; filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(0, 0, 0, .4)); }
.ck-hbar .ends { position: absolute; inset: 0; display: flex; justify-content: space-between; align-items: center; padding: var(--px) calc(var(--px) * 2) 0; font-size: 16px; line-height: 1; pointer-events: none; }
.ck-hbar .ends span:first-child { color: rgba(74, 44, 22, .65); }
.ck-hbar .ends span:last-child { color: rgba(255, 228, 176, .7); }
.ck-hbar .win { position: absolute; top: calc(var(--px) * -1); bottom: calc(var(--px) * -1); background: rgba(255, 246, 200, .28); box-shadow: inset 0 0 0 var(--px) #fff6c8, 0 0 0 var(--px) #3a2410; }
.ck-hbar .win::before, .ck-hbar .win::after { content: ''; position: absolute; top: calc(var(--px) * -3); bottom: calc(var(--px) * -3); width: calc(var(--px) * 2); background: #f2c96a; box-shadow: 0 0 0 var(--px) #3a2410; }
.ck-hbar .win::before { left: calc(var(--px) * -2); }
.ck-hbar .win::after { right: calc(var(--px) * -2); }
.ck-hbar .mark { position: absolute; top: calc(var(--px) * -16); width: calc(var(--px) * 9); height: calc(var(--px) * 20); translate: -50% 0; filter: drop-shadow(0 var(--px) 0 rgba(0, 0, 0, .5)); transition: left .05s linear; }
.ck-hbar .mark img { display: block; width: 100%; height: 100%; }
.ck-flips { grid-column: 1 / -1; font-size: 16px; line-height: 1; color: var(--chalk); padding: calc(var(--px) * 1.5) calc(var(--px) * 3) var(--px);
  background: var(--a-slateT) 0 0 / calc(var(--px) * 24) repeat, #38443f; box-shadow: 0 0 0 var(--px) #1d2422, 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .3); }
.ck-flips:empty { display: none; }
.ck-flips b { font-weight: 400; color: #fff3b0; }
.ck-lane { position: absolute; left: 50%; bottom: calc(var(--px) * 26 + var(--sab)); transform: translateX(-50%); width: min(calc(var(--px) * 160), 84vw); height: calc(var(--px) * 36); box-sizing: border-box; overflow: hidden;
  border-style: solid; border-width: calc(var(--px) * 7); border-image: var(--a-wood) 7 / calc(var(--px) * 7) repeat;
  background: linear-gradient(rgba(255, 248, 236, .28), rgba(255, 248, 236, .12)) padding-box, var(--a-woodT) 0 0 / calc(var(--px) * 32) calc(var(--px) * 16) repeat padding-box; }
.ck-lane .hit { position: absolute; left: calc(var(--px) * 18); top: var(--px); bottom: var(--px); width: calc(var(--px) * 18); transform: translateX(-50%); background: rgba(255, 240, 200, .18);
  box-shadow: inset 0 0 0 var(--px) #3a2410, inset 0 0 0 calc(var(--px) * 2) var(--gold), inset 0 0 0 calc(var(--px) * 3) #3a2410; }
.ck-lane .hit.flash { background: rgba(255, 216, 74, .55); }
.ck-note { position: absolute; top: 50%; width: calc(var(--px) * 16); height: calc(var(--px) * 16); transform: translate(-50%, -50%); display: grid; place-items: center;
  font-family: var(--font-head); font-size: var(--fs-h); line-height: 1; color: #fff; text-shadow: 0 var(--px) 0 rgba(0, 0, 0, .5); background: var(--a-ck-noteL) 0 0 / 100% 100%; }
.ck-note.R { background-image: var(--a-ck-noteR); }
.ck-note.ok { opacity: 0; transform: translate(-50%, -90%) scale(1.5); transition: all .2s; }
.ck-note.miss { filter: grayscale(1) brightness(.6); }
/* the rolling widget (steps/roll.js): a strip per stretch of dough on a plank */
.ck-roll { position: absolute; right: calc(var(--px) * 8 + var(--sar)); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--px) * 3); animation: ckGaugeIn .3s cubic-bezier(.2,1.4,.4,1); }
.ck-rollbars { display: flex; gap: var(--px); padding: calc(var(--px) * 3);
  background: var(--a-woodT) 0 0 / calc(var(--px) * 32) calc(var(--px) * 16) repeat;
  box-shadow: inset var(--px) var(--px) 0 #c08a52, inset calc(var(--px) * -1) calc(var(--px) * -1) 0 #482b15, 0 0 0 var(--px) #26160c, 0 calc(var(--px) * 3) 0 rgba(0, 0, 0, .4); }
.ck-rollbars span { position: relative; width: calc(var(--px) * 5); height: min(calc(var(--px) * 60), 34vh); background: #24160e; box-shadow: 0 0 0 var(--px) #1a0c04; }
.ck-rollbars span b { position: absolute; left: 0; right: 0; background: rgba(138, 224, 90, .3); border-top: var(--px) solid #9af07a; border-bottom: var(--px) solid #9af07a; }
.ck-rollbars span i { position: absolute; left: var(--px); right: var(--px); bottom: 0; background: #f3e2bf; transition: height .08s; box-shadow: inset 0 var(--px) 0 rgba(255, 255, 255, .6); }
.ck-roll .btn { font-size: 16px; }
/* Old Star's lesson: the step HUD sits a bit lower so his card has room on touch screens */
.is-touch .ck-top.lesson { top: calc(var(--px) * 40); }

/* ---------- the result: a framed recipe card with a rosette ---------- */
.ck-result { right: auto; left: calc(var(--px) * 5 + var(--sal)); top: calc(var(--px) * 56 + var(--sat)); width: min(calc(var(--px) * 160), calc(50vw - var(--px) * 6)); animation: ckSlideInL .32s cubic-bezier(.2,1.3,.4,1); }
@keyframes ckSlideInL { from { transform: translateX(calc(-100% - var(--px) * 10)); } }
.ck-result > .scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; overscroll-behavior: contain; touch-action: pan-y;
  display: flex; flex-direction: column; padding: calc(var(--px) * 10) calc(var(--px) * 2) calc(var(--px) * 2); }
.ck-rescard { --dish: 96px; position: relative; flex: none; text-align: center; color: var(--ink);
  border-style: solid; border-width: calc(var(--px) * 8); border-image: var(--a-parch) 8 / calc(var(--px) * 8) repeat;
  background: var(--a-pageT) 0 0 / calc(var(--px) * 32) repeat padding-box, var(--parch) padding-box;
  padding: 0 calc(var(--px) * 2); filter: drop-shadow(0 calc(var(--px) * 3) 0 rgba(10, 4, 8, .5)); }
.ck-rescard .ck-tack { top: calc(var(--px) * -13); }
.ck-rescard .ck-tack.l { left: calc(var(--px) * -2); margin-left: 0; }
.ck-rescard .ck-tack.r { left: auto; right: calc(var(--px) * -2); margin-left: 0; }
.ck-new { position: absolute; right: calc(var(--px) * 2); top: calc(var(--px) * -9); z-index: 2; font-size: 16px; line-height: 1; color: #fff4e8; padding: calc(var(--px) * 1.5) calc(var(--px) * 6) var(--px) calc(var(--px) * 4);
  background: linear-gradient(to bottom, #e8604a 0 var(--px), #c23c2c var(--px) calc(100% - var(--px)), #8a2418 calc(100% - var(--px)));
  clip-path: polygon(0 0, 100% 0, calc(100% - var(--px) * 3) 50%, 100% 100%, 0 100%); transform: rotate(8deg); text-shadow: 0 var(--px) 0 #5a140c;
  filter: drop-shadow(0 var(--px) 0 rgba(0, 0, 0, .4)); animation: ckBop .45s cubic-bezier(.2,1.8,.4,1) .2s both; }
@keyframes ckBop { from { transform: rotate(8deg) scale(.4); } }
.ck-dname { margin: 0 0 calc(var(--px) * 2); font-family: var(--font-head); font-weight: 400; font-size: var(--fs-h); line-height: 1; color: var(--sepia); text-wrap: balance; }
.ck-r-mid { display: flex; align-items: center; justify-content: center; gap: calc(var(--px) * 5); }
.ck-reveal { position: relative; flex: none; width: calc(var(--dish) + var(--px) * 14); height: calc(var(--dish) + var(--px) * 14); }
.ck-rays { position: absolute; inset: calc(var(--px) * -8); background: repeating-conic-gradient(rgba(242,194,58,.45) 0 10deg, transparent 10deg 20deg); border-radius: 50%; animation: ckSpin 8s linear infinite;
  -webkit-mask: radial-gradient(circle, #000 35%, transparent 70%); mask: radial-gradient(circle, #000 35%, transparent 70%); }
@keyframes ckSpin { to { transform: rotate(360deg); } }
.ck-frame { position: relative; box-sizing: border-box; width: 100%; height: 100%; display: grid; place-items: center;
  border-style: solid; border-width: calc(var(--px) * 7); border-image: var(--a-wood) 7 / calc(var(--px) * 7) repeat;
  background: radial-gradient(circle at 50% 40%, #fff6dc, #e8d2a2 70%) padding-box; }
.ck-dish-img { width: var(--dish); height: var(--dish); animation: ckRevealPop .7s cubic-bezier(.2,1.7,.35,1); filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(0,0,0,.25)); }
@keyframes ckRevealPop { 0% { transform: scale(0) rotate(-30deg); } 60% { transform: scale(1.18) rotate(6deg); } 100% { transform: scale(1); } }
.ck-grade { display: flex; flex-direction: column; align-items: center; gap: var(--px); }
.ck-ros { width: calc(var(--px) * 26); height: calc(var(--px) * 36); filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(0, 0, 0, .3)); animation: ckStamp .5s cubic-bezier(.2,1.6,.4,1) .35s both; transform-origin: 50% 30%; }
@keyframes ckStamp { 0% { transform: scale(3) rotate(-25deg); opacity: 0; } 100% { transform: scale(1) rotate(-6deg); opacity: 1; } }
.ck-grade b { font-family: var(--font-head); font-weight: 400; font-size: var(--fs-h); line-height: 1; animation: ckFadeIn .3s ease-out .6s both; }
.ck-grade small { font-size: 16px; color: var(--ink-soft); }
@keyframes ckFadeIn { from { opacity: 0; } }
.ck-bars { display: flex; gap: calc(var(--px) * 4); justify-content: center; flex-wrap: wrap; margin: calc(var(--px) * 3) 0 calc(var(--px) * 2); }
.ck-sres { display: flex; flex-direction: column; align-items: center; gap: var(--px); }
.ck-sres .ck-stamp { height: calc(var(--px) * 9); width: auto; }
.ck-sres small { font-size: 16px; line-height: 1; color: #7a5a3a; }
.ck-sres:nth-child(1) .ck-stamp { animation: ckStampIn .35s cubic-bezier(.3,1.6,.5,1) .5s both; }
.ck-sres:nth-child(2) .ck-stamp { animation: ckStampIn .35s cubic-bezier(.3,1.6,.5,1) .62s both; }
.ck-sres:nth-child(3) .ck-stamp { animation: ckStampIn .35s cubic-bezier(.3,1.6,.5,1) .74s both; }
.ck-sres:nth-child(4) .ck-stamp { animation: ckStampIn .35s cubic-bezier(.3,1.6,.5,1) .86s both; }
.ck-sres:nth-child(n+5) .ck-stamp { animation: ckStampIn .35s cubic-bezier(.3,1.6,.5,1) .98s both; }
.ck-stats { display: flex; gap: calc(var(--px) * 2) calc(var(--px) * 3); flex-wrap: wrap; justify-content: center; margin: calc(var(--px) * 2) 0; }
.ck-stat { display: inline-flex; align-items: center; gap: calc(var(--px) * 1.5); font-size: 16px; line-height: 1; color: var(--ink); white-space: nowrap;
  background: #fffaf0; padding: calc(var(--px) * 1) calc(var(--px) * 2) calc(var(--px) * .5); box-shadow: 0 0 0 var(--px) var(--paper-edge), 0 calc(var(--px) * 2) 0 0 rgba(0, 0, 0, .2); }
.ck-stat.buff { background: #2a1a12; color: #f8ecd2; box-shadow: 0 0 0 var(--px) #000, 0 calc(var(--px) * 2) 0 0 rgba(0, 0, 0, .2); }
.ck-stat-ic { width: var(--icon-s); height: var(--icon-s); margin: calc(var(--px) * -2) 0; }
.ck-dot { display: inline-block; width: calc(var(--px) * 3); height: calc(var(--px) * 3); box-shadow: 0 0 0 var(--px) #000; }
.ck-line { font-size: 16px; line-height: 1.3; color: var(--wood); margin: calc(var(--px) * 2) auto calc(var(--px) * 1); max-width: 34ch; text-wrap: balance; }
.ck-actions { display: flex; gap: calc(var(--px) * 2); justify-content: center; flex-wrap: wrap; margin-top: calc(var(--px) * 4); }
.ck-plank-btn { font: inherit; font-size: 16px; line-height: 1; color: #ffe4b0; cursor: pointer; white-space: nowrap; padding: var(--px) calc(var(--px) * 2) 0;
  border-style: solid; border-width: calc(var(--px) * 6); border-image: var(--a-sign) 6 fill / calc(var(--px) * 6) stretch; background: none;
  text-shadow: 0 var(--px) 0 #2a160a; filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(8, 4, 6, .5)); transition: transform .12s var(--pop), filter .12s; }
.ck-plank-btn:hover { transform: translateY(calc(var(--px) * -1)) rotate(-1.5deg); filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(8, 4, 6, .5)) brightness(1.1); }
.ck-plank-btn:active { transform: translateY(var(--px)); filter: none; }
.ck-plank-btn:focus-visible { outline: var(--px) solid var(--gold); outline-offset: calc(var(--px) * 2); }
.ck-plank-btn.eat { color: #fff3a0; }
.ck-plank-btn[disabled] { cursor: default; filter: grayscale(.6) brightness(.9); transform: none; }

/* 32px item art: keep every icon at a whole-number scale (1x / 2x / 3x) */
@media (max-width: 900px), (max-height: 600px) { .ck-rescard { --dish: 64px; } }
@media (min-width: 1700px) and (min-height: 1000px) {
  .ck-rescard { --dish: 128px; }
  .ck-side, .ck-tab, .ck-plate, .ck-tag, .ck-q, .ck-info, .ck-pot-n, .ck-leave, .ck-stop, .ck-pip, .ck-pip small, .ck-gauge .lbl, .ck-roll .lbl, .ck-done .side,
  .ck-flips, .ck-hbar .ends, .ck-rlabel, .ck-rc-row > small, .ck-tok, .ck-buffchip, .ck-rc-best, .ck-rc-use, .ck-stat, .ck-line, .ck-sres small, .ck-grade small, .ck-plank-btn, .ck-new { font-size: 24px; }
}
/* small windows: the cupboard keeps more room, the pot and bell tuck together */
@media (max-height: 520px) {
  .ck-side, .ck-pantry { top: calc(var(--px) * 22 + var(--sat)); }
  /* the stove counter steps out beside the cupboard so the shelves keep the height */
  .ck-pantry .ck-counter { position: absolute; right: calc(100% + var(--px) * 3); bottom: 0; width: calc(var(--px) * 166); margin: 0; }
  .ck-leave { bottom: auto; top: calc(var(--px) * 16 + var(--sat)); }
  .ck-sign h2 { font-family: var(--font-head); font-size: var(--fs-h); }
  .ck-result { top: calc(var(--px) * 22 + var(--sat)); width: min(calc(var(--px) * 236), 62vw); }
  .ck-rescard { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: calc(var(--px) * 4); align-items: center; }
  .ck-rescard > .ck-dname { grid-column: 1 / -1; }
  .ck-rescard > .ck-r-mid { grid-column: 1; grid-row: 2 / span 3; }
  .ck-rescard > .ck-bars, .ck-rescard > .ck-stats, .ck-rescard > .ck-line { grid-column: 2; }
  .ck-result > .scroll { padding-top: calc(var(--px) * 8); }
  .ck-done { top: calc(var(--px) * 52 + var(--sat)); }
}
/* narrow desktop windows: the bell tucks in beside the pot's handle */
@media (min-width: 901px) and (max-width: 1060px) { .ck-pot { margin-left: 0; } .ck-bell { margin-left: calc(var(--px) * -10); } }
@media (max-width: 640px) { .ck-sign h2 { font-family: var(--font-head); font-size: var(--fs-h); } }
/* phones held upright: the side panels become a bottom sheet across the whole width */
@media (max-aspect-ratio: 4/5) {
  .ck-side { left: calc(var(--px) * 4 + var(--sal)); right: calc(var(--px) * 4 + var(--sar)); width: auto; top: auto; bottom: calc(var(--px) * 4 + var(--sab)); max-height: 66vh; }
  .ck-pantry { height: 66vh; }
  .ck-result { max-height: 72vh; }
  .ck-top { top: calc(var(--px) * 32 + var(--sat)); max-width: calc(100vw - var(--px) * 8); }
  .ck-slate { white-space: normal; text-wrap: balance; }
  .ck-hint { left: auto; right: calc(var(--px) * 4 + var(--sar)); transform: none; max-width: calc(100vw - var(--px) * 58); animation: none; }
  .ck-leave { bottom: auto; top: calc(var(--px) * 16 + var(--sat)); }
  .ck-done { top: calc(var(--px) * 64 + var(--sat)); grid-template-columns: auto; }
  .ck-hbar { width: 76vw; }
  .ck-gauge, .ck-roll { right: calc(var(--px) * 4 + var(--sar)); }
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
