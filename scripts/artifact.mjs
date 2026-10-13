// Turns the single-file build (dist-single/index.html) into an Artifact page:
// no doctype/html/head/body wrappers; <title> first, then styles, markup and the inlined module script.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2] || 'dist-single/index.html';
const out = process.argv[3] || 'dist-single/moleforge.html';
const html = readFileSync(src, 'utf8');

const title = (html.match(/<title>[\s\S]*?<\/title>/) || ['<title>Moleforge</title>'])[0];
const fontLinks = [...html.matchAll(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g)].map((m) => m[0]);
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || ['', ''])[1].replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim();

const page = [
  title,
  '<meta name="description" content="A pixel-art voxel mining and blacksmith game: dig, forge and save a million gold to escape to the surface.">',
  ...fontLinks,
  // the game is one committed dark look; keep the host background in step with it
  '<style>:root{color-scheme:dark}html,body{height:100%;margin:0;background:#140e18}</style>',
  ...styles,
  body,
  ...scripts,
].join('\n');

writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB) · title ${title} · ${styles.length} style · ${scripts.length} script blocks`);
