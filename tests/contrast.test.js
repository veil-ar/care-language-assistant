// Contrast checks for the semantic colour tokens in styles.css, light and dark.
// Run: node tests/contrast.test.js
'use strict';

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

/** Return the body of the first `selector {` block, matching braces. */
function block(selector) {
  const at = css.indexOf(selector + ' {');
  if (at === -1) throw new Error('styles.css: no block for ' + selector);
  let i = css.indexOf('{', at) + 1;
  const start = i;
  for (let depth = 1; depth > 0; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
  }
  return css.slice(start, i - 1);
}

function props(body) {
  const out = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body)) !== null) out[m[1]] = m[2].trim();
  return out;
}

const root = props(block(':root'));
const darkAttr = props(block(':root[data-theme="dark"]'));
const darkMedia = props(block(':root:not([data-theme="light"])'));

/** Resolve a token through var() references down to a hex value. */
function resolve(name, vars, seen) {
  seen = seen || [];
  if (seen.includes(name)) throw new Error('Circular token ' + seen.concat(name).join(' → '));
  const v = vars[name] !== undefined ? vars[name] : root[name];
  if (v === undefined) throw new Error('Undefined token ' + name);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return resolve(ref[1], vars, seen.concat(name));
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(name + ' is not a 6-digit hex: ' + v);
  return v.toLowerCase();
}

function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function ratio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// [foreground, background, minimum, what it is]
const PAIRS = [
  ['--text', '--surface-page', 4.5, 'body text on page'],
  ['--text', '--surface-card', 4.5, 'body text on card'],
  ['--text-muted', '--surface-card', 4.5, 'muted text on card'],
  ['--text-muted', '--surface-sunken', 4.5, 'muted text on sunken'],
  ['--accent-text', '--accent', 4.5, 'text on accent button'],
  ['--accent', '--surface-card', 4.5, 'link on card'],
  ['--state-pending-text', '--state-pending-bg', 4.5, 'pending state'],
  ['--state-done-text', '--state-done-bg', 4.5, 'done state'],
  ['--state-ignored-text', '--state-ignored-bg', 4.5, 'ignored state'],
  ['--state-urgent-text', '--state-urgent-bg', 4.5, 'urgent state'],
  ['--focus', '--surface-card', 3, 'focus ring on card'],
  ['--border-strong', '--surface-card', 3, 'control boundary on card'],
];

const failures = [];

// The two dark blocks must stay identical, or one route to dark mode drifts.
const darkKeys = new Set(Object.keys(darkAttr).concat(Object.keys(darkMedia)));
darkKeys.forEach(k => {
  if (darkAttr[k] !== darkMedia[k]) {
    failures.push('Dark token blocks differ for ' + k + ': [data-theme="dark"] ' +
      darkAttr[k] + ' vs prefers-color-scheme ' + darkMedia[k]);
  }
});

// No hex literal outside the token blocks.
const marker = '/* ===== end tokens ===== */';
const tail = css.slice(css.indexOf(marker));
if (css.indexOf(marker) === -1) failures.push('Missing "' + marker + '" marker in styles.css');
const stray = tail.match(/#[0-9a-f]{3,8}\b/gi) || [];
if (stray.length) failures.push('Hex literals outside token blocks: ' + stray.join(', '));

const rows = [];
[['light', {}], ['dark', darkAttr]].forEach(([theme, vars]) => {
  PAIRS.forEach(([fg, bg, min, label]) => {
    const f = resolve(fg, vars), b = resolve(bg, vars);
    const r = ratio(f, b);
    const ok = r >= min;
    rows.push([theme, fg + ' / ' + bg, f + ' / ' + b, r.toFixed(2) + ':1', '≥ ' + min, ok ? 'PASS' : 'FAIL']);
    if (!ok) {
      failures.push(theme + ': ' + fg + ' (' + f + ') on ' + bg + ' (' + b + ') is ' +
        r.toFixed(2) + ':1, needs ' + min + ':1 (' + label + ')');
    }
  });
});

const head = ['theme', 'pair', 'values', 'ratio', 'min', ''];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
const fmt = r => r.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
console.log(fmt(head));
console.log(widths.map(w => '-'.repeat(w)).join('  '));
rows.forEach(r => console.log(fmt(r)));
console.log('');

if (failures.length) {
  failures.forEach(f => console.log('FAIL  ' + f));
  console.log('\n' + (rows.length - failures.length) + ' passed, ' + failures.length + ' failed');
  process.exit(1);
}
console.log(rows.length + ' passed, 0 failed');
