/*
 * Care Language Assistant — writing checks
 * Pattern-based layers that push opinion wording towards observable fact.
 * Deterministic, dependency-free beyond the word lists and the care matcher
 * (used for quoted speech and for care-term spans we must not touch).
 *
 * Layers:
 *   opinion      link verb + optional intensifiers + judgement word
 *                (or intensifier + judgement with no link verb)
 *   speculation  the writer's own reaction or guess
 *   person       vague reference to a person
 *   tense        narrow "have had" rule for a completed past event
 *
 * Never rewrites text and never invents a fact: rewrites are built only from
 * what the writer types into the guided box (see buildDetail).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data/writing-library.js'), require('./matcher.js'));
  } else {
    root.CareWritingChecks = factory(root.CareWritingLibrary, root.CareMatcher);
  }
})(typeof self !== 'undefined' ? self : this, function (LIB, MATCHER) {
  'use strict';

  var CAT = LIB.CATEGORIES;

  var BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
  var BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** Words separated by any whitespace; hyphens also accept a space or unicode hyphen. */
  function wordPattern(term) {
    return term.split(' ').map(function (word) {
      return word.split('-').map(escapeRe).join('[-\\u2010\\u2011 ]');
    }).join('\\s+');
  }

  /** Longest first so "a bit" beats "a", "out of control" beats "out". */
  function alternation(words) {
    return words.slice()
      .sort(function (a, b) { return b.length - a.length; })
      .map(wordPattern)
      .join('|');
  }

  /** Judgement alternation with the narrow "not followed by" guards applied. */
  function judgementAlternation(words) {
    return words.slice()
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (word) {
        var guard = LIB.JUDGEMENT_GUARDS[word.toLowerCase()];
        return wordPattern(word) + (guard ? '(?!\\s+(?:' + guard + '))' : '');
      })
      .join('|');
  }

  var LINK = alternation(LIB.LINK_VERBS);
  var INT = alternation(LIB.INTENSIFIERS);
  var JUDGEMENT_GROUPS = ['behaviour', 'emotion', 'general'];
  var JUDGEMENT = {};
  JUDGEMENT_GROUPS.forEach(function (g) { JUDGEMENT[g] = judgementAlternation(LIB.JUDGEMENTS[g]); });
  var JUDGEMENT_ALL = judgementAlternation(
    LIB.JUDGEMENTS.behaviour.concat(LIB.JUDGEMENTS.emotion, LIB.JUDGEMENTS.general));

  /** Substitute the {LINK} / {INT} / {JUDGEMENT} placeholders used by the pattern lists. */
  function expand(source) {
    return source
      .replace(/\{LINK\}/g, LINK)
      .replace(/\{INT\}/g, INT)
      .replace(/\{JUDGEMENT\}/g, JUDGEMENT_ALL);
  }

  /*
   * One regex for the opinion layer. Branch 1 needs a link verb and allows 0-2
   * intensifiers; branch 2 covers "so angry" with no link verb. The three capture
   * groups say which judgement group matched, and ordered alternation plus the
   * advancing lastIndex means the longest span at the leftmost position wins.
   */
  var OPINION_SOURCE = BOUNDARY_BEFORE +
    '(?:' +
      '(?:' + LINK + ')\\s+(?:(?:' + INT + ')\\s+){0,2}' +
      '|' +
      '(?:(?:' + INT + ')\\s+){1,2}' +
    ')' +
    '(?:(' + JUDGEMENT.behaviour + ')|(' + JUDGEMENT.emotion + ')|(' + JUDGEMENT.general + '))' +
    BOUNDARY_AFTER;

  function wrap(source) { return BOUNDARY_BEFORE + '(?:' + expand(source) + ')' + BOUNDARY_AFTER; }

  var SPECULATION_SOURCES = LIB.SPECULATION_PATTERNS.map(wrap);
  var PERSON_SOURCES = LIB.PERSON_PATTERNS.map(wrap);
  var PAST_VERB_RE = new RegExp(
    '(?:' + BOUNDARY_BEFORE + '(?:' + alternation(LIB.PAST_VERBS) + ')' + BOUNDARY_AFTER +
    '|' + BOUNDARY_BEFORE + '[\\p{L}]+ed' + BOUNDARY_AFTER + ')', 'iu');

  var HAVE_HAD_SOURCE = BOUNDARY_BEFORE + 'have\\s+had' + BOUNDARY_AFTER;

  /* ---------- helpers ---------- */

  var findQuoteSpans = (MATCHER && MATCHER.findQuoteSpans)
    ? MATCHER.findQuoteSpans
    : function () { return []; };

  function overlaps(start, end, spans) {
    for (var i = 0; i < spans.length; i++) {
      if (start < spans[i].end && end > spans[i].start) return true;
    }
    return false;
  }

  /** Sentence spans, split on . ! ? and newlines. "18:40" and "24°C" stay intact. */
  function sentenceSpans(text) {
    var spans = [];
    var start = 0;
    var re = /[.!?\n]+/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var end = m.index + m[0].length;
      if (text.slice(start, end).trim() !== '') spans.push({ start: start, end: end });
      start = end;
    }
    if (start < text.length && text.slice(start).trim() !== '') {
      spans.push({ start: start, end: text.length });
    }
    return spans;
  }

  function sentenceAt(text, start, end) {
    var spans = sentenceSpans(text);
    for (var i = 0; i < spans.length; i++) {
      if (start < spans[i].end && end > spans[i].start) return spans[i];
    }
    return { start: 0, end: text.length };
  }

  function candidate(category, start, end, source) {
    var c = CAT[category];
    return {
      start: start,
      end: end,
      source: source,
      category: c.id,
      categoryName: c.name,
      kind: c.kind,
      message: c.message,
      prompt: c.prompt,
      example: c.example,
      fix: c.fix || null
    };
  }

  function scan(text, source, build) {
    var re = new RegExp(source, 'giu');
    var out = [];
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; } // defensive: zero-width safety
      out.push(build(m));
    }
    return out;
  }

  /* ---------- layers ---------- */

  function opinionCandidates(text) {
    return scan(text, OPINION_SOURCE, function (m) {
      var group = m[1] ? 'behaviour' : (m[2] ? 'emotion' : 'general');
      return candidate(group, m.index, m.index + m[0].length, m[0]);
    });
  }

  function patternCandidates(text, sources, category) {
    var out = [];
    sources.forEach(function (src) {
      out = out.concat(scan(text, src, function (m) {
        return candidate(category, m.index, m.index + m[0].length, m[0]);
      }));
    });
    return out;
  }

  /** "have had" in a narrative about a completed event: a past-tense verb follows it. */
  function tenseCandidates(text) {
    return scan(text, HAVE_HAD_SOURCE, function (m) {
      return { index: m.index, source: m[0] };
    }).filter(function (hit) {
      var sentence = sentenceAt(text, hit.index, hit.index + hit.source.length);
      var rest = text.slice(hit.index + hit.source.length, sentence.end);
      return PAST_VERB_RE.test(rest);
    }).map(function (hit) {
      return candidate('tense', hit.index, hit.index + hit.source.length, hit.source);
    });
  }

  /* ---------- overlap resolution ---------- */

  var RANK = { person: 0, speculation: 1, behaviour: 2, emotion: 3, general: 4, tense: 5 };

  /** Longest span first, then leftmost, then by layer. Overlapping spans are dropped. */
  function resolve(candidates) {
    var ordered = candidates.slice().sort(function (a, b) {
      var la = a.end - a.start;
      var lb = b.end - b.start;
      if (lb !== la) return lb - la;
      if (a.start !== b.start) return a.start - b.start;
      return RANK[a.category] - RANK[b.category];
    });
    var kept = [];
    ordered.forEach(function (c) {
      if (!overlaps(c.start, c.end, kept)) kept.push(c);
    });
    return kept.sort(function (a, b) { return a.start - b.start; });
  }

  /* ---------- public check ---------- */

  function careSpansFor(text) {
    if (!MATCHER || typeof MATCHER.check !== 'function') return [];
    var r = MATCHER.check(text);
    return r.suggestions.concat(r.quoted).map(function (s) { return { start: s.start, end: s.end }; });
  }

  /**
   * Check a note's writing. Never modifies the text.
   * @param {string} text
   * @param {Array}  [careSpans] spans of care-term matches to leave alone.
   *                 Omitted: taken from the care matcher.
   * @returns {{items: Array, quoted: Array, summary: Object}}
   */
  function check(text, careSpans) {
    var input = typeof text === 'string' ? text : '';
    var care = careSpans || careSpansFor(input);
    var quotes = findQuoteSpans(input);

    var all = opinionCandidates(input)
      .concat(patternCandidates(input, SPECULATION_SOURCES, 'speculation'))
      .concat(patternCandidates(input, PERSON_SOURCES, 'person'))
      .concat(tenseCandidates(input));

    // Care wording is handled by the care matcher: never flag over the top of it.
    var usable = all.filter(function (c) { return !overlaps(c.start, c.end, care); });

    var inQuotes = [];
    var outside = [];
    usable.forEach(function (c) {
      if (overlaps(c.start, c.end, quotes)) inQuotes.push(c);
      else outside.push(c);
    });

    var items = resolve(outside);
    items.forEach(function (it, i) {
      it.id = 'w' + (i + 1);
      it.status = 'pending';
      it.detail = null;
      it.replacement = null;
    });
    var quoted = resolve(inQuotes);

    return { items: items, quoted: quoted, summary: summarise(items) };
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /** Note-level fact check. Neutral counts only: no score and no percentage. */
  function summarise(items) {
    var counts = { opinion: 0, speculation: 0, person: 0, tense: 0 };
    items.forEach(function (it) { counts[it.kind]++; });
    counts.total = items.length;
    counts.text = 'Fact check: ' + plural(counts.opinion, 'opinion phrase', 'opinion phrases') +
      ', ' + plural(counts.speculation, 'speculation phrase', 'speculation phrases') +
      '. Strong notes describe what was seen and heard.';
    return counts;
  }

  /* ---------- guided rewrite ---------- */

  function tidy(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '');
  }

  function hasAnyDetail(fields) {
    return LIB.DETAIL_FIELDS.some(function (f) { return tidy(fields && fields[f.id]) !== ''; });
  }

  /**
   * Join the writer's own words into a replacement phrase.
   * Only the typed text plus structural labels and punctuation: no facts are added,
   * nothing is inferred, and an empty box returns an empty string.
   */
  function buildDetail(fields) {
    var f = fields || {};
    var actions = tidy(f.actions);
    var said = tidy(f.said);
    var when = tidy(f.when);
    var present = tidy(f.present);
    var staff = tidy(f.staff);

    var clauses = [];
    if (actions !== '') clauses.push((when !== '' ? 'At ' + when + ', ' : '') + actions);
    else if (when !== '') clauses.push('At ' + when);
    if (said !== '') clauses.push('Said: “' + said + '”');
    if (present !== '') clauses.push('Present: ' + present);
    if (staff !== '') clauses.push('Staff: ' + staff);

    if (clauses.length === 0) return '';
    return clauses.join('. ') + '.';
  }

  // Our own structural labels, which may be lowercased mid-sentence. The writer's
  // words are never recased: "Sam" must not become "sam".
  var OWN_LABELS = ['At ', 'Said:', 'Present:', 'Staff:'];

  /**
   * The built detail, fitted to the text around the flagged phrase. Punctuation and
   * the case of our own labels only: no word is added, removed or reworded, so the
   * rewrite still says exactly what the writer typed.
   *   - the trailing full stop is dropped unless the phrase ends the note, so the
   *     note's own punctuation is not doubled ("fists..");
   *   - mid-sentence, a leading label is lowercased ("At 16:10" -> "at 16:10").
   */
  function replacementFor(original, item, detail) {
    var text = typeof original === 'string' ? original : '';
    var built = String(detail == null ? '' : detail);
    if (built === '') return '';

    var after = text.slice(item.end);
    if (!/^\s*$/.test(after)) built = built.replace(/[.]+$/, '');

    var before = text.slice(0, item.start);
    var startsSentence = /(?:^|[.!?]["'\u201D\u2019]?)\s*$/.test(before);
    if (!startsSentence) {
      for (var i = 0; i < OWN_LABELS.length; i++) {
        if (built.indexOf(OWN_LABELS[i]) === 0) {
          built = built.charAt(0).toLowerCase() + built.slice(1);
          break;
        }
      }
    }
    return built;
  }

  /** The item's sentence with the fitted replacement in place of the flagged phrase. */
  function previewSentence(original, item, detail) {
    var text = typeof original === 'string' ? original : '';
    var s = sentenceAt(text, item.start, item.end);
    var before = text.slice(s.start, item.start);
    var after = text.slice(item.end, s.end);
    return (before + replacementFor(text, item, detail) + after).replace(/\s+/g, ' ').trim();
  }

  return {
    check: check,
    summarise: summarise,
    buildDetail: buildDetail,
    hasAnyDetail: hasAnyDetail,
    replacementFor: replacementFor,
    previewSentence: previewSentence,
    sentenceSpans: sentenceSpans,
    sentenceAt: sentenceAt,
    DETAIL_FIELDS: LIB.DETAIL_FIELDS,
    CATEGORIES: CAT,
    SOURCES: { opinion: OPINION_SOURCE, speculation: SPECULATION_SOURCES, person: PERSON_SOURCES }
  };
});
