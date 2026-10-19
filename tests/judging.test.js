// Runs the ten published judging scenarios against the engine.
// Usage: node tests/judging.test.js
'use strict';
const assert = require('assert');
const M = require('../matcher.js');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (e) { failures.push(name); console.log('FAIL  ' + name + '\n      ' + e.message); }
}
function accept(r, i) { r.suggestions[i].status = 'accepted'; }
function ignore(r, i) { r.suggestions[i].status = 'ignored'; }

test('1. Find and explain', () => {
  const t = 'The service user arrived.';
  const r = M.check(t);
  assert.strictEqual(r.suggestions.length, 1);
  const s = r.suggestions[0];
  assert.strictEqual(s.source, 'service user');
  assert.strictEqual(s.replacement, 'person we support');
  assert.ok(s.reason.length > 10);
  assert.strictEqual(M.buildReviewed(t, r.suggestions), t);
});

test('2. Longer phrases', () => {
  const t = 'The care leaver went to the contact centre for family contact.';
  const r = M.check(t);
  assert.deepStrictEqual(r.suggestions.map(s => s.replacement), ['care-experienced person', 'family centre', 'family time']);
  r.suggestions.forEach(s => assert.ok(s.reason));
  assert.strictEqual(M.buildReviewed(t, r.suggestions), t);
});

test('3. Accept one', () => {
  const t = 'The client attended family contact.';
  const r = M.check(t);
  accept(r, 0);
  assert.strictEqual(M.buildReviewed(t, r.suggestions), 'The person we support attended family contact.');
  assert.strictEqual(t, 'The client attended family contact.');
  assert.strictEqual(r.suggestions[1].status, 'pending');
  assert.strictEqual(r.suggestions[1].replacement, 'family time');
});

test('4. Ignore one', () => {
  const t = 'The client attended family contact.';
  const r = M.check(t);
  ignore(r, 0);
  assert.strictEqual(r.suggestions[0].status, 'ignored');
  assert.strictEqual(M.buildReviewed(t, r.suggestions), t);
  assert.strictEqual(r.suggestions[1].status, 'pending');
});

test('5. Remaining pairs', () => {
  const cases = [
    ['service users', 'people we support'],
    ['clients', 'people we support'],
    ['looked-after child', 'child in care'],
    ['foster placement', 'foster home'],
    ['residential placement', "children's home"]
  ];
  cases.forEach(([term, rep]) => {
    const t = 'Recorded wording: ' + term + '.';
    const r = M.check(t);
    assert.strictEqual(r.suggestions.length, 1, term);
    accept(r, 0);
    assert.strictEqual(M.buildReviewed(t, r.suggestions), 'Recorded wording: ' + rep + '.');
  });
});

test('6. Repeats and boundaries', () => {
  const t = 'The client called the client. The CLIENT arrived. The clientele waited.';
  const r = M.check(t);
  assert.strictEqual(r.suggestions.length, 3);
  assert.deepStrictEqual(r.suggestions.map(s => s.source), ['client', 'client', 'CLIENT']);
  accept(r, 0);
  assert.strictEqual(M.buildReviewed(t, r.suggestions), 'The person we support called the client. The CLIENT arrived. The clientele waited.');
  assert.strictEqual(r.suggestions[1].status, 'pending');
  assert.strictEqual(r.suggestions[2].status, 'pending');
  ignore(r, 2);
  accept(r, 1);
  assert.strictEqual(M.buildReviewed(t, r.suggestions), 'The person we support called the person we support. The CLIENT arrived. The clientele waited.');
});

test('7. Unrelated words', () => {
  const t = 'Staff will contact the office. Sam made eye contact. The placement officer called.';
  const r = M.check(t);
  assert.strictEqual(r.suggestions.length, 0);
  assert.strictEqual(M.buildReviewed(t, r.suggestions), t);
});

test('8. Direct quotes (straight and curly)', () => {
  ['"', '\u201C\u201D'].forEach(q => {
    const open = q[0], close = q[1] || q[0];
    const t = 'Sam said, ' + open + 'The client attended family contact.' + close + ' Staff recorded family contact at 18:00.';
    const r = M.check(t);
    assert.strictEqual(r.suggestions.length, 1, 'only outside occurrence flagged');
    assert.strictEqual(r.suggestions[0].source, 'family contact');
    accept(r, 0);
    assert.strictEqual(M.buildReviewed(t, r.suggestions),
      'Sam said, ' + open + 'The client attended family contact.' + close + ' Staff recorded family time at 18:00.');
  });
});

test('9. Preserve facts', () => {
  const t = 'At 18:40, Alex reported that the client pushed Sam and left a bruise.';
  const r = M.check(t);
  assert.strictEqual(r.suggestions.length, 1);
  accept(r, 0);
  assert.strictEqual(M.buildReviewed(t, r.suggestions), 'At 18:40, Alex reported that the person we support pushed Sam and left a bruise.');
  assert.strictEqual(t, 'At 18:40, Alex reported that the client pushed Sam and left a bruise.');
});

test('10. Reset state', () => {
  const r1 = M.check('The client attended family contact.');
  accept(r1, 0); ignore(r1, 1);
  const t = 'Everyone ate dinner.';
  const r2 = M.check(t);
  assert.strictEqual(r2.suggestions.length, 0);
  assert.strictEqual(M.buildReviewed(t, r2.suggestions), t);
});

test('Extra: plurals, capitalisation, hyphen variant', () => {
  const t = 'Looked after children met care leavers. Clients arrived.';
  const r = M.check(t);
  assert.deepStrictEqual(r.suggestions.map(s => s.replacement), ['Children in care', 'care-experienced people', 'People we support']);
});

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
process.exit(failures.length ? 1 : 0);
