/*
 * Care Language Assistant — matching engine
 * Deterministic, dependency-free. Works in the browser (window.CareMatcher)
 * and in Node (module.exports) so the judging scenarios can be unit-tested.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CareMatcher = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R = {
    person: 'Use person-focused wording in this care note: describe the individual as a person we support, not as a service or client.',
    familyTime: 'Use "family time": it describes time with family in warmer, everyday language rather than a procedural term.',
    familyCentre: 'Use "family centre": it names the place by its purpose for the family rather than as an official contact venue.',
    careExperienced: 'Use "care-experienced person": it describes a life experience rather than defining someone by leaving care.',
    fosterHome: 'Use "foster home": describe where a child lives as a home, not a placement.',
    childrensHome: 'Use "children\'s home": plain, home-focused wording a child would recognise.',
    childInCare: 'Use "child in care": clearer everyday wording than the legal term "looked-after".'
  };

  // assessed: true = one of the ten published pairs. Others are plural/variant forms.
  var LIBRARY = [
    { term: 'service user', replacement: 'person we support', reason: R.person, assessed: true },
    { term: 'service users', replacement: 'people we support', reason: R.person, assessed: true },
    { term: 'client', replacement: 'person we support', reason: R.person, assessed: true },
    { term: 'clients', replacement: 'people we support', reason: R.person, assessed: true },
    { term: 'family contact', replacement: 'family time', reason: R.familyTime, assessed: true },
    { term: 'contact centre', replacement: 'family centre', reason: R.familyCentre, assessed: true },
    { term: 'contact centres', replacement: 'family centres', reason: R.familyCentre, assessed: false },
    { term: 'care leaver', replacement: 'care-experienced person', reason: R.careExperienced, assessed: true },
    { term: 'care leavers', replacement: 'care-experienced people', reason: R.careExperienced, assessed: false },
    { term: 'foster placement', replacement: 'foster home', reason: R.fosterHome, assessed: true },
    { term: 'foster placements', replacement: 'foster homes', reason: R.fosterHome, assessed: false },
    { term: 'residential placement', replacement: "children's home", reason: R.childrensHome, assessed: true },
    { term: 'residential placements', replacement: "children's homes", reason: R.childrensHome, assessed: false },
    { term: 'looked-after child', replacement: 'child in care', reason: R.childInCare, assessed: true },
    { term: 'looked-after children', replacement: 'children in care', reason: R.childInCare, assessed: false }
  ];

  // Normalise a phrase so "Looked after  child" and "looked-after child" share a key.
  function keyOf(s) {
    return s.toLowerCase().replace(/[\s\-\u2010\u2011]+/g, ' ').trim();
  }

  var BY_KEY = {};
  LIBRARY.forEach(function (e) { BY_KEY[keyOf(e.term)] = e; });

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function termPattern(term) {
    // Words may be separated by any whitespace; hyphens also accept a space or unicode hyphen.
    return term.split(' ').map(function (word) {
      return word.split('-').map(escapeRe).join('[-\\u2010\\u2011 ]');
    }).join('\\s+');
  }

  // Longest phrases first so "service users" beats "service user" beats "client".
  var SORTED = LIBRARY.slice().sort(function (a, b) { return b.term.length - a.term.length; });
  var BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
  var BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';
  var SOURCE = BOUNDARY_BEFORE + '(?:' + SORTED.map(function (e) { return termPattern(e.term); }).join('|') + ')' + BOUNDARY_AFTER;

  function newRegex() { return new RegExp(SOURCE, 'giu'); }

  /** Spans of double-quoted speech: straight "..." and curly “...”. Unclosed quotes protect to end of line. */
  function findQuoteSpans(text) {
    var spans = [];
    var i = 0;
    while (i < text.length) {
      var ch = text[i];
      var close = null;
      if (ch === '"') close = '"';
      else if (ch === '\u201C') close = '\u201D';
      if (close === null) { i++; continue; }
      var j = text.indexOf(close, i + 1);
      var end;
      if (j === -1) {
        var nl = text.indexOf('\n', i + 1);
        end = nl === -1 ? text.length : nl;
      } else {
        end = j + 1;
      }
      spans.push({ start: i, end: end });
      i = end;
    }
    return spans;
  }

  function insideAny(start, end, spans) {
    for (var k = 0; k < spans.length; k++) {
      if (start < spans[k].end && end > spans[k].start) return true;
    }
    return false;
  }

  /** Match the case of the flagged wording: ALL CAPS stays caps, Capitalised stays capitalised. */
  function matchCase(source, replacement) {
    var letters = source.replace(/[^\p{L}]/gu, '');
    if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
      return replacement.toUpperCase();
    }
    var first = source.charAt(0);
    if (first !== first.toLowerCase() && first === first.toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  /**
   * Check a note. Never modifies the text.
   * Returns { suggestions: [...], quoted: [...] } where quoted = matches skipped inside quoted speech.
   */
  function check(text) {
    var input = typeof text === 'string' ? text : '';
    var quotes = findQuoteSpans(input);
    var re = newRegex();
    var suggestions = [];
    var quoted = [];
    var m;
    while ((m = re.exec(input)) !== null) {
      var source = m[0];
      var start = m.index;
      var end = start + source.length;
      var entry = BY_KEY[keyOf(source)];
      if (!entry) continue; // defensive: should not happen
      var item = {
        start: start,
        end: end,
        source: source,
        term: entry.term,
        replacement: matchCase(source, entry.replacement),
        reason: entry.reason,
        assessed: entry.assessed
      };
      if (insideAny(start, end, quotes)) quoted.push(item);
      else suggestions.push(item);
    }
    suggestions.forEach(function (s, idx) { s.id = 's' + (idx + 1); s.status = 'pending'; });
    return { suggestions: suggestions, quoted: quoted };
  }

  /** Build the reviewed text from the untouched original plus accepted suggestions. */
  function buildReviewed(original, suggestions) {
    var accepted = suggestions
      .filter(function (s) { return s.status === 'accepted'; })
      .sort(function (a, b) { return a.start - b.start; });
    var out = '';
    var pos = 0;
    accepted.forEach(function (s) {
      out += original.slice(pos, s.start) + s.replacement;
      pos = s.end;
    });
    return out + original.slice(pos);
  }

  /**
   * Split text into segments for rendering.
   * mode 'original': flagged wording marked with its suggestion.
   * mode 'reviewed': accepted wording replaced by its replacement.
   */
  function segments(original, suggestions, mode) {
    var ordered = suggestions.slice().sort(function (a, b) { return a.start - b.start; });
    var segs = [];
    var pos = 0;
    ordered.forEach(function (s) {
      if (s.start > pos) segs.push({ type: 'text', text: original.slice(pos, s.start) });
      if (mode === 'reviewed' && s.status === 'accepted') {
        segs.push({ type: 'accepted', text: s.replacement, suggestion: s });
      } else {
        segs.push({ type: mode === 'reviewed' ? s.status : 'flag', text: original.slice(s.start, s.end), suggestion: s });
      }
      pos = s.end;
    });
    if (pos < original.length) segs.push({ type: 'text', text: original.slice(pos) });
    return segs;
  }

  return {
    LIBRARY: LIBRARY,
    check: check,
    buildReviewed: buildReviewed,
    segments: segments,
    findQuoteSpans: findQuoteSpans,
    matchCase: matchCase
  };
});
