// Writing checks: opinion, speculation, vague person and the narrow tense rule.
// Usage: node tests/writing.test.js
'use strict';
const assert = require('assert');
const M = require('../matcher.js');
const W = require('../writing-checks.js');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (e) { failures.push(name); console.log('FAIL  ' + name + '\n      ' + e.message); }
}

const HOST_SENTENCE =
  'I have had a child I was working with being very difficult and was confused why she was so angry.';

// The ten published judging inputs, used to prove no false positives.
const JUDGING_INPUTS = [
  'The service user arrived.',
  'The care leaver went to the contact centre for family contact.',
  'The client attended family contact.',
  'Recorded wording: service users.',
  'Recorded wording: looked-after child.',
  'The client called the client. The CLIENT arrived. The clientele waited.',
  'Staff will contact the office. Sam made eye contact. The placement officer called.',
  'Sam said, "The client attended family contact." Staff recorded family contact at 18:00.',
  'At 18:40, Alex reported that the client pushed Sam and left a bruise.',
  'Everyone ate dinner.'
];

function find(items, source) {
  return items.filter(i => i.source.toLowerCase() === source.toLowerCase());
}

test('Host sentence: all five required items, with category and copy', () => {
  const r = W.check(HOST_SENTENCE);
  const expected = [
    ['have had', 'tense'],
    ['a child I was working with', 'person'],
    ['being very difficult', 'behaviour'],
    ['was confused why', 'speculation'],
    ['was so angry', 'emotion']
  ];
  expected.forEach(([source, category]) => {
    const hits = find(r.items, source);
    assert.strictEqual(hits.length, 1, 'expected exactly one “' + source + '”, got ' + hits.length);
    const it = hits[0];
    assert.strictEqual(it.category, category, source + ' category');
    assert.ok(it.message && it.message.trim().length > 10, source + ' message');
    assert.ok(it.prompt && it.prompt.trim().length > 5, source + ' prompt');
    assert.strictEqual(HOST_SENTENCE.slice(it.start, it.end), it.source, source + ' span');
  });
  assert.strictEqual(find(r.items, 'have had')[0].fix, 'had', 'tense fix');
  assert.ok(r.items.length >= 5);
});

test('Host sentence: items are ordered and never overlap', () => {
  const r = W.check(HOST_SENTENCE);
  for (let i = 1; i < r.items.length; i++) {
    assert.ok(r.items[i].start >= r.items[i - 1].end, 'items overlap at ' + i);
  }
});

test('Host sentence: note-level fact check summary', () => {
  const r = W.check(HOST_SENTENCE);
  assert.strictEqual(r.summary.opinion, 2);
  assert.strictEqual(r.summary.speculation, 1);
  assert.strictEqual(r.summary.text,
    'Fact check: 2 opinion phrases, 1 speculation phrase. ' +
    'Strong notes describe what was seen and heard.');
  assert.ok(!/%|score/i.test(r.summary.text), 'no score or percentage');
});

test('Emotion attribution: “Sam seemed fine.”', () => {
  const r = W.check('Sam seemed fine.');
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].source, 'seemed fine');
  assert.strictEqual(r.items[0].category, 'emotion');
  assert.strictEqual(r.items[0].kind, 'opinion');
});

test('No false positives on the unrelated-words judging input', () => {
  const t = 'Staff will contact the office. Sam made eye contact. The placement officer called.';
  const r = W.check(t);
  assert.strictEqual(r.items.length, 0, 'items: ' + JSON.stringify(r.items.map(i => i.source)));
  assert.strictEqual(r.quoted.length, 0);
});

test('All ten judging inputs: care results unchanged, no overlap with care terms', () => {
  JUDGING_INPUTS.forEach(t => {
    const before = M.check(t);
    const snapshot = JSON.stringify(before.suggestions.map(s => [s.start, s.end, s.source, s.replacement]));

    const w = W.check(t);
    const after = M.check(t);
    assert.strictEqual(
      JSON.stringify(after.suggestions.map(s => [s.start, s.end, s.source, s.replacement])),
      snapshot, 'care results changed for: ' + t);

    const careSpans = before.suggestions.concat(before.quoted);
    w.items.concat(w.quoted).forEach(it => {
      careSpans.forEach(c => {
        assert.ok(!(it.start < c.end && it.end > c.start),
          '“' + it.source + '” overlaps care term “' + c.source + '” in: ' + t);
      });
    });
  });
});

test('Quoted speech is left exactly as said', () => {
  const t = 'Sam said, "I am so angry."';
  const r = W.check(t);
  assert.strictEqual(r.items.length, 0, 'nothing inside the quotes is flagged');
  assert.strictEqual(r.quoted.length, 1);
  assert.strictEqual(r.quoted[0].source, 'so angry');
});

test('Facts are not judgements: “The room was very warm, 24°C.”', () => {
  const r = W.check('The room was very warm, 24°C.');
  assert.strictEqual(r.items.length, 0, 'items: ' + JSON.stringify(r.items.map(i => i.source)));
});

test('Intensifier without a link verb, and longest span wins', () => {
  const a = W.check('Sam was really upset.');
  assert.deepStrictEqual(a.items.map(i => i.source), ['was really upset']);
  const b = W.check('Really upset, Sam left the room.');
  assert.deepStrictEqual(b.items.map(i => i.source), ['Really upset']);
});

test('Writer’s feelings layer: a spread of patterns', () => {
  [
    ['I thought she wanted to leave.', 'I thought'],
    ['She kicked the door for no reason.', 'for no reason'],
    ['It happened out of nowhere.', 'out of nowhere'],
    ['She must have been tired.', 'must have'],
    ['I don’t know why she left.', null]
  ].forEach(([t, source]) => {
    const r = W.check(t);
    if (source) {
      assert.ok(find(r.items, source).length === 1, 'expected “' + source + '” in: ' + t);
      assert.strictEqual(find(r.items, source)[0].kind, 'speculation');
    }
    r.items.forEach(i => assert.ok(i.message && i.prompt, 'copy for ' + i.source));
  });
  const r = W.check("I don't know why she left.");
  assert.deepStrictEqual(r.items.map(i => i.source), ["I don't know why"]);
});

test('Vague person layer, and the preferred wording is not flagged', () => {
  assert.deepStrictEqual(W.check('I supported a young person today.').items.map(i => i.source),
    ['a young person']);
  assert.deepStrictEqual(W.check('Someone I was supporting knocked the door.').items.map(i => i.source),
    ['Someone I was supporting']);
  assert.strictEqual(W.check('The person we support arrived.').items.length, 0);
  assert.strictEqual(W.check('A child in care attended the meeting.').items.length, 0);
});

test('Tense rule is narrow: needs a past-tense verb later in the sentence', () => {
  assert.deepStrictEqual(W.check('I have had a child who was shouting.').items.map(i => i.category)
    .filter(c => c === 'tense'), ['tense']);
  assert.strictEqual(W.check('I have had enough training for the role.').items.length, 0);
  assert.strictEqual(W.check('Sam had a drink at 18:00.').items.length, 0);
});

test('Guided rewrite builds only from what the writer types', () => {
  assert.strictEqual(W.buildDetail({}), '');
  assert.strictEqual(W.buildDetail({ actions: '   ' }), '');
  assert.strictEqual(W.hasAnyDetail({}), false);
  assert.strictEqual(W.hasAnyDetail({ when: '16:10' }), true);

  const built = W.buildDetail({
    actions: 'threw a cup at the wall',
    said: 'leave me alone',
    when: '16:10',
    present: 'Sam, one staff member',
    staff: 'stayed nearby and offered a drink'
  });
  assert.strictEqual(built,
    'At 16:10, threw a cup at the wall. Said: “leave me alone”. ' +
    'Present: Sam, one staff member. Staff: stayed nearby and offered a drink.');

  // Nothing is invented: every word the writer typed appears, and nothing else
  // except the field labels and punctuation.
  ['threw a cup at the wall', 'leave me alone', '16:10', 'Sam, one staff member',
    'stayed nearby and offered a drink'].forEach(part => assert.ok(built.indexOf(part) !== -1, part));
  assert.strictEqual(built.replace(/At |Said: “|”|Present: |Staff: |[.]/g, '')
    .split(/\s+/).filter(Boolean).length,
    ('threw a cup at the wall leave me alone 16:10 Sam, one staff member ' +
      'stayed nearby and offered a drink').split(/\s+/).length);

  assert.strictEqual(W.buildDetail({ when: '16:10' }), 'At 16:10.');
  assert.strictEqual(W.buildDetail({ said: 'I am not going' }), 'Said: “I am not going”.');
});

test('Preview puts the rewrite back into its own sentence', () => {
  const t = 'Sam was so angry. Staff stayed nearby.';
  const r = W.check(t);
  const it = find(r.items, 'was so angry')[0];
  const built = W.buildDetail({ actions: 'raised their voice and clenched their fists' });
  assert.strictEqual(W.previewSentence(t, it, built),
    'Sam raised their voice and clenched their fists.');
  assert.strictEqual(W.replacementFor(t, it, built),
    'raised their voice and clenched their fists');
  // Mid-sentence the note's own punctuation is kept, and our own label is lowercased.
  const mid = 'Sam was so angry and left.';
  const m2 = W.check(mid).items.filter(i => i.source === 'was so angry')[0];
  assert.strictEqual(W.replacementFor(mid, m2, 'Shouted twice.'), 'Shouted twice');
  assert.strictEqual(W.replacementFor(mid, m2, 'At 16:10, shouted twice.'), 'at 16:10, shouted twice');
  assert.strictEqual(W.previewSentence(mid, m2, 'At 16:10, shouted twice.'),
    'Sam at 16:10, shouted twice and left.');

  // The writer's own words keep their case, even mid-sentence.
  assert.strictEqual(W.replacementFor(mid, m2, 'Sam shouted twice.'), 'Sam shouted twice');

  // At the end of the note, with no punctuation of its own, the full stop is kept.
  const end = 'Sam was so angry';
  const e2 = W.check(end).items[0];
  assert.strictEqual(W.replacementFor(end, e2, 'At 16:10, shouted twice.'), 'at 16:10, shouted twice.');
  assert.strictEqual(t, 'Sam was so angry. Staff stayed nearby.', 'original untouched');
});

test('Care spans can be supplied by the caller', () => {
  const t = 'The client was very difficult.';
  const care = M.check(t).suggestions;
  const r = W.check(t, care.map(s => ({ start: s.start, end: s.end })));
  assert.deepStrictEqual(r.items.map(i => i.source), ['was very difficult']);
});

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
process.exit(failures.length ? 1 : 0);
