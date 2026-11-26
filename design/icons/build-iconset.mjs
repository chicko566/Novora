// Novora Icon-Set-Generator
// Liest design/icons/novora-icons/*.svg + index.json und schreibt prototype/web/iconset.js.
// Deterministisch: Icons werden nach Key sortiert ausgegeben, keine Zeitstempel.
// Aufruf:  node design/icons/build-iconset.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'novora-icons');
const OUT = resolve(HERE, '..', '..', 'prototype', 'web', 'iconset.js');

const index = JSON.parse(readFileSync(join(SRC, 'index.json'), 'utf8'));
const meta = new Map((index.icons ?? index).map((e) => [e.key, e]));

const files = readdirSync(SRC).filter((f) => f.endsWith('.svg'));
const keys = files.map((f) => f.slice(0, -4)).sort();

const missing = keys.filter((k) => !meta.has(k));
if (missing.length) throw new Error('index.json ohne Eintrag für: ' + missing.join(', '));

const inner = (svg) => {
  const open = svg.indexOf('>', svg.indexOf('<svg'));
  const close = svg.lastIndexOf('</svg>');
  if (open < 0 || close < 0) throw new Error('kein <svg>-Rahmen');
  return svg.slice(open + 1, close).replace(/\s+/g, ' ').trim();
};

const out = {};
for (const key of keys) {
  const svg = readFileSync(join(SRC, key + '.svg'), 'utf8');
  const m = meta.get(key);
  out[key] = {
    label: m.label_de,
    cat: m.category,
    svg: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner(svg) + '</g>',
  };
}

const body = JSON.stringify(out, null, 0);
const head = '// GENERIERT von design/icons/build-iconset.mjs – nicht direkt bearbeiten.\n' +
  '// Quelle: design/icons/novora-icons/*.svg + index.json\n';
writeFileSync(OUT, head + 'window.NOVORA_ICONS = ' + body + ';\n', 'utf8');
// Kopie neben preview.html, damit die Vorschau ohne Server-Wurzelumbau funktioniert.
const PREVIEW_COPY = resolve(HERE, 'novora-icons', 'iconset.js');
writeFileSync(PREVIEW_COPY, head + 'window.NOVORA_ICONS = ' + body + ';\n', 'utf8');

console.log('iconset.js: ' + keys.length + ' Icons -> ' + OUT);
