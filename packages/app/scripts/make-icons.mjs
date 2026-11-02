// Renders the Poke Ball logo (same geometry as src/components/ui/PokeBallLogo.tsx)
// into the PWA / home-screen icons in public/. Run: node scripts/make-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });

const CREAM = '#f6f1e4';
const EDGE = '#0b1426';
const RED = '#e3350d';
const BG = '#0f1a2e';

const ball = `
  <circle cx="50" cy="50" r="46" fill="${CREAM}" stroke="${EDGE}" stroke-width="6"/>
  <path d="M4 50 A46 46 0 0 1 96 50 Z" fill="${RED}" stroke="${EDGE}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M18 30 A36 36 0 0 1 40 14" fill="none" stroke="${CREAM}" stroke-opacity="0.55" stroke-width="6" stroke-linecap="round"/>
  <rect x="4" y="46" width="92" height="8" fill="${EDGE}"/>
  <circle cx="50" cy="50" r="15" fill="${CREAM}" stroke="${EDGE}" stroke-width="6"/>
  <circle cx="50" cy="50" r="6" fill="${CREAM}" stroke="${EDGE}" stroke-width="3"/>`;

// scale = ball size as a fraction of the canvas. Maskable icons keep the ball
// inside the 80% safe zone (0.62 leaves margin for circular masks).
function svg(scale) {
  const s = scale;
  const off = (100 - 100 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${BG}"/>
  <g transform="translate(${off} ${off}) scale(${s})">${ball}</g></svg>`;
}

function render(name, size, scale) {
  const png = new Resvg(svg(scale), { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(out, name), png);
  console.log(`${name} ${size}px`);
}

render('pwa-192.png', 192, 0.84);
render('pwa-512.png', 512, 0.84);
render('maskable-512.png', 512, 0.62);
render('apple-touch-icon.png', 180, 0.78);
writeFileSync(join(out, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${ball}</svg>`);
console.log('favicon.svg');
