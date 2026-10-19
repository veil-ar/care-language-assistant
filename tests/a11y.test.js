// Static accessibility checks on index.html: header toggles, head script, icons.
// Run: node tests/a11y.test.js
'use strict';

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (err) { failed++; console.log('FAIL  ' + name + '\n      ' + err.message); }
}
function check(cond, msg) { if (!cond) throw new Error(msg); }

/** Attributes of an opening tag string, e.g. '<button type="button" id="x">'. */
function attrs(tag) {
  const out = {};
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const body = tag.replace(/^<[\w-]+/, '').replace(/\/?>$/, '');
  let m;
  while ((m = re.exec(body)) !== null) {
    out[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
  }
  return out;
}

/** The opening tag of the element with this id. */
function openTagById(id) {
  const re = new RegExp('<([\\w-]+)\\b[^>]*\\bid="' + id + '"[^>]*>');
  const m = re.exec(html);
  check(m, '#' + id + ' not found in index.html');
  return { name: m[1].toLowerCase(), attrs: attrs(m[0]) };
}

['theme-toggle', 'font-toggle'].forEach(id => {
  test('#' + id + ' is a <button type="button"> with aria-label and aria-pressed', () => {
    const el = openTagById(id);
    check(el.name === 'button', '#' + id + ' is <' + el.name + '>, expected <button>');
    check(el.attrs.type === 'button', '#' + id + ' needs type="button", has ' + JSON.stringify(el.attrs.type));
    check((el.attrs['aria-label'] || '').trim() !== '', '#' + id + ' needs a non-empty aria-label');
    check('aria-pressed' in el.attrs, '#' + id + ' needs an aria-pressed attribute');
    check(el.attrs['aria-pressed'] === 'true' || el.attrs['aria-pressed'] === 'false',
      '#' + id + ' aria-pressed must be "true" or "false", has ' + JSON.stringify(el.attrs['aria-pressed']));
  });
});

test('Toggles sit in a labelled "Display settings" group', () => {
  const m = /<(\w+)\b[^>]*role="group"[^>]*>([\s\S]*?)<\/\1>/.exec(html);
  check(m, 'No role="group" element found');
  check(attrs(m[0].slice(0, m[0].indexOf('>') + 1))['aria-label'] === 'Display settings',
    'The group needs aria-label="Display settings"');
  check(/id="theme-toggle"/.test(m[2]) && /id="font-toggle"/.test(m[2]), 'Both toggles must be inside the group');
});

test('Head script is the first child of <head> and applies theme and font', () => {
  const head = /<head>([\s\S]*?)<\/head>/.exec(html);
  check(head, 'No <head> found');
  const first = /^\s*<script>([\s\S]*?)<\/script>/.exec(head[1]);
  check(first, 'The first child of <head> must be an inline <script>');
  check(first[1].includes('cla-font'), 'Head script must reference "cla-font"');
  check(first[1].includes('data-theme'), 'Head script must reference data-theme');
  check(first[1].includes('data-font'), 'Head script must set data-font');
  check(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/.test(first[1]), 'Head script must wrap localStorage in try/catch');
  check(head[1].indexOf('<script>') < head[1].indexOf('styles.css'), 'Head script must come before the stylesheet');
});

test('Every <svg> inside a <button> has aria-hidden="true"', () => {
  const buttons = html.match(/<button\b[\s\S]*?<\/button>/g) || [];
  let svgs = 0;
  buttons.forEach(b => {
    (b.match(/<svg\b[^>]*>/g) || []).forEach(tag => {
      svgs++;
      check(attrs(tag)['aria-hidden'] === 'true', 'SVG missing aria-hidden="true": ' + tag.slice(0, 80) + '…');
    });
  });
  check(svgs > 0, 'Expected icon SVGs inside buttons, found none');
});

test('Status live region for announcements is present', () => {
  const el = openTagById('status');
  check(el.attrs.role === 'status' && el.attrs['aria-live'] === 'polite', '#status needs role="status" aria-live="polite"');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
