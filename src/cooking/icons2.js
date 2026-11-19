// 32×32 icons for the wave-16 wild finds (spec { k: 'cook', t }): the stone nut and a pod of puff
// spores. Same hand-pixel kit as ./icons.js: hand-placed outlines (lifeKit.loop), lit planes from
// the top left, seams where parts overlap, a hue-tinted ink outline, glints.
import { mat, mix, hash2, seam, form, ink, glint, line, loop, isTop, isBot, dot, dotE, twinkle } from '../gfx/px/lifeKit.js';

function nut(pc) {
  // a knobbly stone nut, ridged like a walnut, and a cracked half beside it showing the kernel
  const R = mat(0x9a7a56, { cont: 1.15, sat: 0.8 });
  const shell = loop([[13, 5.4], [17.4, 5.8], [21, 8.6], [22.8, 12.6], [22.4, 17.6], [20, 21.6], [15.6, 23.8], [10.8, 23], [7.2, 19.8], [5.6, 15.2], [6.4, 10.4], [9.2, 7]], { jit: 0.35, seed: 5 });
  seam(pc, shell, 'shadow');
  form(pc, shell, R, { cx: 11, cy: 11, rx: 11, ry: 11, bias: 0.06 });
  // the seam down its middle and the wrinkled ridges either side
  line(pc, 14.6, 6, 14, 23, R[5], shell);
  shell.eachD((X, Y, x, y) => {
    if (isTop(shell, X, Y) || isBot(shell, X, Y)) return;
    const r = Math.sin((y + Math.sin(x * 0.9) * 1.6) * 0.95 + (x < 14.3 ? 0 : 1.7));
    if (r > 0.82) pc.set(X, Y, R[x < 12 ? 1 : 2]);
    else if (r < -0.85) pc.set(X, Y, R[4]);
    if (hash2(X, Y, 11) < 0.05) pc.set(X, Y, mix(pc.getHex(X, Y), 0x5a6a3a, 0.25)); // a fleck of moss
  });
  // the cracked half: a cup of shell, the pale kernel bulging out of it
  const half = loop([[17.6, 21.4], [22.6, 19.6], [27.6, 20.6], [30, 24], [28.4, 28.2], [23.6, 29.8], [18.8, 28.4], [16.8, 24.8]], { jit: 0.3, seed: 9 });
  seam(pc, half, 'shadow');
  form(pc, half, R, { bias: 0.08 });
  const ker = loop([[18.8, 22.6], [22.4, 21], [26.6, 21.6], [28.6, 23.6], [27.2, 25.6], [22.8, 26.2], [19.4, 25.2]]);
  const K = mat(0xeed4a0, { cont: 1.05, sat: 0.7 });
  form(pc, ker, K, { cx: 21, cy: 21.6, rx: 7, ry: 4, bias: 0.04 });
  ker.eachD((X, Y, x, y) => { if (Math.abs(x - 23.4 - Math.sin(y * 1.3) * 0.6) < 0.5 && !isTop(ker, X, Y)) pc.set(X, Y, K[4]); });
  ink(pc);
  // shell crumbs
  dot(pc, 15, 28, R[3]); dot(pc, 13, 29, R[4]); dot(pc, 31, 27, R[3]);
  glint(pc, 9, 10, 1, 0xfff4dc);
  glint(pc, 20, 23, 1, 0xffffff);
}

function spores(pc) {
  // a soft puffball pod split at the top, glowing spores drifting out of it in a little cloud
  const R = mat(0xc8b8d8, { cont: 1.1, sat: 0.7 });
  const pod = loop([[15.6, 9.6], [19.6, 10.6], [23.4, 13.6], [25.4, 18.4], [24.6, 23.6], [20.6, 27.2], [15, 28.2], [9.6, 27], [6.2, 23.4], [5.6, 18.2], [7.8, 13.4], [11.6, 10.4]], { jit: 0.3, seed: 4 });
  seam(pc, pod, 'shadow');
  form(pc, pod, R, { cx: 12, cy: 15, rx: 12, ry: 11, bias: 0.05 });
  // warty skin: pale bumps lit on top, a split mouth at the top full of glow
  pod.eachD((X, Y, x, y) => {
    if (isTop(pod, X, Y) || isBot(pod, X, Y)) return;
    const h = hash2(X >> 1, Y >> 1, 7);
    if (h < 0.08) pc.set(X, Y, R[1]);
    else if (h > 0.95) pc.set(X, Y, R[4]);
  });
  const mouth = loop([[11.6, 11.2], [15.6, 10], [19.6, 11.4], [17.6, 13], [15.4, 13.4], [13.4, 12.8]]);
  mouth.eachD((X, Y) => { pc.set(X, Y, 0xa8f0c0); pc.emit?.(X, Y, 0.9); });
  // the stalk foot in moss
  const foot = loop([[9, 26.4], [21.6, 26.4], [24.6, 28.6], [20, 30.6], [11, 30.8], [6.4, 28.8]], { jit: 0.4, seed: 2 });
  seam(pc, foot, 'shadow');
  form(pc, foot, mat(0x5a8a3a, { cont: 1.1 }), { bias: 0.05 });
  ink(pc);
  // the spore cloud: little glowing specks rising and drifting right
  const SP = [[16, 7], [18, 5], [14, 4], [21, 6], [20, 2.6], [24, 4.4], [12.6, 6.4], [26.6, 7.6], [23, 9]];
  SP.forEach(([x, y], i) => { dot(pc, x, y, i % 3 ? 0xc8ffd8 : 0xffffff); dotE(pc, x, y, 0.8); });
  twinkle(pc, 19, 3.6, 0xffffff, 0xc8ffd8, 1, 0.9);
  glint(pc, 10, 15, 1, 0xffffff);
}

export const DRAW2 = { nut, spores };
