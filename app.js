(function () {
  'use strict';

  var M = window.CareMatcher;
  var W = window.CareWritingChecks;

  var EXAMPLE = 'I have had a child I was working with being very difficult and was confused why she was so angry. ' +
    'At 18:40, Alex reported that the client pushed Sam and left a bruise. ' +
    'Sam said, "I want more family contact." Staff arranged family contact at the contact centre for Friday. ' +
    'The care leaver from the foster placement visited Meadow House.';

  var el = {
    form: document.getElementById('check-form'),
    input: document.getElementById('note-input'),
    error: document.getElementById('note-error'),
    stale: document.getElementById('stale-notice'),
    example: document.getElementById('example-btn'),
    clear: document.getElementById('clear-btn'),
    status: document.getElementById('status'),
    results: document.getElementById('results'),
    heading: document.getElementById('suggestions-heading'),
    summary: document.getElementById('summary'),
    list: document.getElementById('suggestion-list'),
    none: document.getElementById('none-found'),
    quoted: document.getElementById('quoted-info'),
    factCheck: document.getElementById('fact-check'),
    writingList: document.getElementById('writing-list'),
    writingNone: document.getElementById('writing-none'),
    writingQuoted: document.getElementById('writing-quoted'),
    original: document.getElementById('original-text'),
    reviewed: document.getElementById('reviewed-text'),
    changeCount: document.getElementById('change-count'),
    copy: document.getElementById('copy-btn')
  };

  // Single source of truth. Original is a frozen snapshot; reviewed is derived.
  // box holds the open guided-rewrite box: its item id and the writer's own words.
  var state = {
    original: null,
    suggestions: [], quoted: [],
    writing: [], writingQuoted: [], factCheck: null,
    box: null
  };

  function emptyState() {
    return {
      original: null,
      suggestions: [], quoted: [],
      writing: [], writingQuoted: [], factCheck: null,
      box: null
    };
  }

  var STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', ignored: 'Ignored' };
  var WRITING_STATUS_LABEL = { pending: 'To review', rewritten: 'Rewritten', ignored: 'Ignored' };

  function announce(msg) {
    // Clear then set so repeated identical messages are still announced.
    el.status.textContent = '';
    window.setTimeout(function () { el.status.textContent = msg; }, 30);
  }

  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = false;
    el.input.setAttribute('aria-invalid', 'true');
    el.input.focus();
  }

  function clearError() {
    el.error.textContent = '';
    el.error.hidden = true;
    el.input.removeAttribute('aria-invalid');
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- Check ---------- */
  function runCheck() {
    var text = el.input.value;
    if (text.trim() === '') {
      showError('Enter a care note before checking. The note box is empty.');
      announce('');
      return;
    }
    clearError();
    el.stale.hidden = true;

    // Fresh check: everything from any previous note is discarded.
    var result = M.check(text);
    var careSpans = result.suggestions.concat(result.quoted).map(function (s) {
      return { start: s.start, end: s.end };
    });
    var writing = W.check(text, careSpans);

    state = emptyState();
    state.original = text;
    state.suggestions = result.suggestions;
    state.quoted = result.quoted;
    state.writing = writing.items;
    state.writingQuoted = writing.quoted;
    state.factCheck = writing.summary;

    el.results.hidden = false;
    render();

    var n = state.suggestions.length;
    var w = state.writing.length;
    announce('Check complete. ' +
      (n === 0 ? 'No care terms found. ' : plural(n, 'care wording suggestion', 'care wording suggestions') + '. ') +
      (w === 0 ? 'No writing suggestions. ' : plural(w, 'writing suggestion', 'writing suggestions') + '. ') +
      'The original note has not been changed.');
    el.heading.focus();
  }

  /* ---------- Rendering ---------- */
  function render() {
    renderSummary();
    renderList();
    renderWriting();
    renderVersions();
  }

  function counts() {
    var c = { pending: 0, accepted: 0, ignored: 0 };
    state.suggestions.forEach(function (s) { c[s.status]++; });
    return c;
  }

  function renderSummary() {
    var n = state.suggestions.length;
    el.none.hidden = n !== 0;
    el.summary.hidden = n === 0;
    if (n) {
      var c = counts();
      el.summary.innerHTML = '';
      var b = document.createElement('strong');
      b.textContent = plural(n, 'suggestion', 'suggestions');
      el.summary.appendChild(b);
      el.summary.appendChild(document.createTextNode(
        ' · ' + c.pending + ' pending · ' + c.accepted + ' accepted · ' + c.ignored + ' ignored'));
    }
    var q = state.quoted.length;
    el.quoted.hidden = q === 0;
    el.quoted.textContent = q ? plural(q, 'care term was', 'care terms were') +
      ' found inside quoted speech and left exactly as said.' : '';
  }

  function contextFor(s) {
    var text = state.original;
    var radius = 40;
    var a = Math.max(0, s.start - radius);
    var b = Math.min(text.length, s.end + radius);
    var frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode('In context: ' + (a > 0 ? '…' : '') + text.slice(a, s.start)));
    var mark = document.createElement('mark');
    mark.textContent = text.slice(s.start, s.end);
    frag.appendChild(mark);
    frag.appendChild(document.createTextNode(text.slice(s.end, b) + (b < text.length ? '…' : '')));
    return frag;
  }

  function button(label, cls, aria, action, id) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-small ' + cls;
    btn.textContent = label;
    btn.setAttribute('aria-label', aria);
    btn.dataset.action = action;
    btn.dataset.id = id;
    return btn;
  }

  function renderList() {
    el.list.innerHTML = '';
    var total = state.suggestions.length;
    state.suggestions.forEach(function (s, i) {
      var num = i + 1;
      var desc = '“' + s.source + '” to “' + s.replacement + '”';

      var li = document.createElement('li');
      li.className = 'sugg';
      li.id = 'sugg-' + s.id;
      li.dataset.status = s.status;

      var top = document.createElement('div');
      top.className = 'sugg-top';
      var numEl = document.createElement('span');
      numEl.className = 'sugg-num';
      numEl.textContent = 'Suggestion ' + num + ' of ' + total;
      var badge = document.createElement('span');
      badge.className = 'badge badge-' + s.status;
      badge.textContent = STATUS_LABEL[s.status];
      top.appendChild(numEl);
      top.appendChild(badge);

      var change = document.createElement('p');
      change.className = 'sugg-change';
      var lab = document.createElement('span');
      lab.className = 'label';
      lab.textContent = 'Current wording → Suggested wording';
      var from = document.createElement('span');
      from.className = 'from';
      from.textContent = s.source;
      var arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      var sr = document.createElement('span');
      sr.className = 'visually-hidden';
      sr.textContent = ' change to ';
      var to = document.createElement('span');
      to.className = 'to';
      to.textContent = s.replacement;
      change.appendChild(lab);
      change.appendChild(from);
      change.appendChild(arrow);
      change.appendChild(sr);
      change.appendChild(to);

      var reason = document.createElement('p');
      reason.className = 'reason';
      var rl = document.createElement('strong');
      rl.textContent = 'Reason: ';
      reason.appendChild(rl);
      reason.appendChild(document.createTextNode(s.reason));

      var ctx = document.createElement('p');
      ctx.className = 'context';
      ctx.appendChild(contextFor(s));

      var row = document.createElement('div');
      row.className = 'button-row';
      if (s.status === 'pending') {
        row.appendChild(button('Accept', 'btn-accept', 'Accept suggestion ' + num + ': ' + desc, 'accept', s.id));
        row.appendChild(button('Ignore', 'btn-ignore', 'Ignore suggestion ' + num + ': ' + desc, 'ignore', s.id));
      } else {
        row.appendChild(button('Undo', 'btn-undo', 'Undo ' + s.status + ' suggestion ' + num + ': ' + desc, 'undo', s.id));
      }

      li.appendChild(top);
      li.appendChild(change);
      li.appendChild(reason);
      li.appendChild(ctx);
      li.appendChild(row);
      el.list.appendChild(li);
    });
  }

  /* ---------- Writing suggestions ---------- */

  // The guided box shows one field set per kind. A vague person needs a name, not
  // five fields; everything else uses the labelled fields from the library.
  var PERSON_FIELDS = [
    { id: 'name', label: 'Who is this about? (fictional name or initials)', placeholder: 'e.g. Sam (fictional)' }
  ];

  function fieldsFor(item) {
    return item.kind === 'person' ? PERSON_FIELDS : W.DETAIL_FIELDS;
  }

  /** Build the replacement from the writer's own words only. Never invents a fact. */
  function buildFrom(item, values) {
    if (item.kind === 'person') return String(values.name || '').replace(/\s+/g, ' ').trim();
    return W.buildDetail(values);
  }

  function anyFilled(item, values) {
    return fieldsFor(item).some(function (f) {
      return String(values[f.id] || '').trim() !== '';
    });
  }

  function findWriting(id) {
    for (var i = 0; i < state.writing.length; i++) {
      if (state.writing[i].id === id) return { s: state.writing[i], num: i + 1 };
    }
    return null;
  }

  function factPill() {
    var fc = state.factCheck;
    el.factCheck.textContent = fc ? fc.text : '';
    el.factCheck.hidden = !fc;
  }

  function line(cls, label, text) {
    var p = document.createElement('p');
    p.className = cls;
    if (label) {
      var strong = document.createElement('strong');
      strong.textContent = label;
      p.appendChild(strong);
    }
    p.appendChild(document.createTextNode(text));
    return p;
  }

  /** The guided rewrite box: labelled fields, a live preview, and nothing pre-filled. */
  function detailBox(item) {
    var values = state.box.values;
    var built = buildFrom(item, values);
    var enabled = anyFilled(item, values);

    var box = document.createElement('div');
    box.className = 'detail-box';

    var legend = document.createElement('p');
    legend.className = 'detail-legend';
    legend.appendChild(document.createTextNode('Replacing: '));
    var ref = document.createElement('span');
    ref.className = 'from';
    ref.textContent = item.source;
    legend.appendChild(ref);
    box.appendChild(legend);
    box.appendChild(line('help small', '', 'Only what you type is used. Leave a field blank if you do not know it.'));

    fieldsFor(item).forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'detail-field';
      var id = 'detail-' + item.id + '-' + f.id;
      var label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = f.label;
      var input = document.createElement('input');
      input.type = 'text';
      input.id = id;
      input.value = values[f.id] || '';
      input.placeholder = f.placeholder;
      input.dataset.field = f.id;
      input.dataset.id = item.id;
      input.autocomplete = 'off';
      wrap.appendChild(label);
      wrap.appendChild(input);
      box.appendChild(wrap);
    });

    var preview = document.createElement('div');
    preview.className = 'preview';
    preview.id = 'preview-' + item.id;
    preview.setAttribute('role', 'status');
    preview.setAttribute('aria-live', 'polite');
    preview.appendChild(paintPreview(item, built, enabled));
    box.appendChild(preview);

    var row = document.createElement('div');
    row.className = 'button-row';
    var save = button('Save', 'btn-accept', 'Save the detail you have written for suggestion ' +
      findWriting(item.id).num, 'save', item.id);
    save.disabled = !enabled;
    row.appendChild(save);
    row.appendChild(button('Cancel', 'btn-ignore', 'Cancel adding detail', 'cancel', item.id));
    box.appendChild(row);

    return box;
  }

  function paintPreview(item, built, enabled) {
    var frag = document.createDocumentFragment();
    var head = document.createElement('p');
    head.className = 'preview-head';
    head.textContent = 'Preview';
    frag.appendChild(head);
    var body = document.createElement('p');
    body.className = 'preview-body';
    body.textContent = enabled
      ? W.previewSentence(state.original, item, built)
      : 'Type into a field above to build the replacement. Nothing is written for you.';
    if (!enabled) body.className += ' preview-empty';
    frag.appendChild(body);
    return frag;
  }

  /** Live update: keep focus in the field, so only the preview and Save change. */
  function refreshBox(item) {
    var values = state.box.values;
    var built = buildFrom(item, values);
    var enabled = anyFilled(item, values);
    var preview = document.getElementById('preview-' + item.id);
    if (preview) {
      preview.innerHTML = '';
      preview.appendChild(paintPreview(item, built, enabled));
    }
    var save = el.writingList.querySelector('button[data-action="save"][data-id="' + item.id + '"]');
    if (save) save.disabled = !enabled;
  }

  function renderWriting() {
    factPill();
    el.writingList.innerHTML = '';
    var total = state.writing.length;
    el.writingNone.hidden = total !== 0;

    state.writing.forEach(function (item, i) {
      var num = i + 1;
      var li = document.createElement('li');
      li.className = 'sugg sugg-writing';
      li.id = 'write-' + item.id;
      li.dataset.status = item.status === 'rewritten' ? 'accepted' : item.status;
      li.dataset.kind = item.kind;

      var top = document.createElement('div');
      top.className = 'sugg-top';
      var numEl = document.createElement('span');
      numEl.className = 'sugg-num';
      numEl.textContent = item.categoryName + ' · ' + num + ' of ' + total;
      var badge = document.createElement('span');
      badge.className = 'badge badge-' + li.dataset.status;
      badge.textContent = WRITING_STATUS_LABEL[item.status];
      top.appendChild(numEl);
      top.appendChild(badge);
      li.appendChild(top);

      var change = document.createElement('p');
      change.className = 'sugg-change';
      var lab = document.createElement('span');
      lab.className = 'label';
      lab.textContent = item.status === 'rewritten' ? 'Flagged wording → Your wording' : 'Flagged wording';
      change.appendChild(lab);
      var from = document.createElement('span');
      from.className = 'from';
      from.textContent = item.source;
      change.appendChild(from);
      if (item.status === 'rewritten') {
        var arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        change.appendChild(arrow);
        var to = document.createElement('span');
        to.className = 'to';
        to.textContent = item.replacement;
        change.appendChild(to);
      }
      li.appendChild(change);

      li.appendChild(line('reason', 'Why: ', item.message));
      if (item.prompt) li.appendChild(line('prompt', 'Ask yourself: ', item.prompt));
      if (item.example && item.kind !== 'tense') {
        li.appendChild(line('example', 'For example: ', item.example));
      }
      var ctx = document.createElement('p');
      ctx.className = 'context';
      ctx.appendChild(contextFor(item));
      li.appendChild(ctx);

      var open = state.box && state.box.id === item.id;
      if (open) {
        li.appendChild(detailBox(item));
      } else {
        var row = document.createElement('div');
        row.className = 'button-row';
        if (item.status === 'pending') {
          if (item.fix) {
            row.appendChild(button('Use “' + item.fix + '”', 'btn-accept',
              'Replace “' + item.source + '” with “' + item.fix + '”', 'fix', item.id));
          }
          row.appendChild(button(item.kind === 'person' ? 'Add name' : 'Add detail', 'btn-primary',
            'Add detail for writing suggestion ' + num + ': “' + item.source + '”', 'detail', item.id));
          row.appendChild(button('Ignore', 'btn-ignore',
            'Ignore writing suggestion ' + num + ': “' + item.source + '”', 'wignore', item.id));
        } else {
          row.appendChild(button('Undo', 'btn-undo',
            'Undo writing suggestion ' + num + ': “' + item.source + '”', 'wundo', item.id));
        }
        li.appendChild(row);
      }

      el.writingList.appendChild(li);
    });

    var q = state.writingQuoted.length;
    el.writingQuoted.hidden = q === 0;
    el.writingQuoted.textContent = q
      ? plural(q, 'phrase was', 'phrases were') + ' found inside quoted speech and left exactly as said.'
      : '';
  }

  function paint(target, segs) {
    target.innerHTML = '';
    segs.forEach(function (seg) {
      var node;
      if (seg.type === 'text') {
        node = document.createTextNode(seg.text);
      } else if (seg.type === 'accepted') {
        node = document.createElement('ins');
        node.textContent = seg.text;
        node.title = 'Accepted: was “' + seg.suggestion.source + '”';
      } else if (seg.type === 'flag') {
        node = document.createElement('mark');
        node.className = 'flag is-' + seg.suggestion.status +
          (seg.suggestion.writing ? ' is-writing' : '');
        if (seg.suggestion.writing) node.title = seg.suggestion.writing.categoryName;
        node.textContent = seg.text;
      } else {
        node = document.createTextNode(seg.text); // pending/ignored in reviewed: unchanged text
      }
      target.appendChild(node);
    });
  }

  /*
   * Care suggestions and writing items share the two version panes. Writing items
   * are mapped onto the same shape the matcher's renderer expects; a saved rewrite
   * counts as an accepted change. The two layers never overlap, because the writing
   * checks drop anything sitting on a care term.
   */
  function mergedSpans() {
    var writing = state.writing
      .filter(function (w) { return w.status !== 'rewritten' || w.replacement; })
      .map(function (w) {
        return {
          start: w.start,
          end: w.end,
          source: w.source,
          replacement: w.replacement || '',
          status: w.status === 'rewritten' ? 'accepted' : w.status,
          writing: w
        };
      });
    return state.suggestions.concat(writing)
      .sort(function (a, b) { return a.start - b.start; });
  }

  function acceptedCount() {
    return mergedSpans().filter(function (s) { return s.status === 'accepted'; }).length;
  }

  function renderVersions() {
    var spans = mergedSpans();
    paint(el.original, M.segments(state.original, spans, 'original'));
    paint(el.reviewed, M.segments(state.original, spans, 'reviewed'));
    var a = acceptedCount();
    el.changeCount.textContent = a === 0 ? 'No changes yet' : plural(a, 'change', 'changes') + ' accepted';
  }

  /* ---------- Actions ---------- */
  function find(id) {
    for (var i = 0; i < state.suggestions.length; i++) {
      if (state.suggestions[i].id === id) return { s: state.suggestions[i], num: i + 1 };
    }
    return null;
  }

  el.list.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var hit = find(btn.dataset.id);
    if (!hit) return;
    var s = hit.s;
    var action = btn.dataset.action;
    var msg;
    if (action === 'accept') {
      s.status = 'accepted';
      msg = 'Accepted suggestion ' + hit.num + ': “' + s.source + '” is now “' + s.replacement + '” in the reviewed note.';
    } else if (action === 'ignore') {
      s.status = 'ignored';
      msg = 'Ignored suggestion ' + hit.num + ': “' + s.source + '” kept as written.';
    } else {
      s.status = 'pending';
      msg = 'Suggestion ' + hit.num + ' is pending again.';
    }
    render();
    announce(msg);
    // Keep keyboard focus on the same suggestion's new first button.
    var next = document.querySelector('#sugg-' + s.id + ' button');
    if (next) next.focus();
  });

  /* ---------- Writing actions ---------- */
  el.writingList.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var hit = findWriting(btn.dataset.id);
    if (!hit) return;
    var item = hit.s;
    var action = btn.dataset.action;
    var msg;
    var focusSelector = null;

    if (action === 'detail') {
      // Nothing is pre-filled: the writer supplies every word.
      state.box = { id: item.id, values: {} };
      renderWriting();
      var first = el.writingList.querySelector('#write-' + item.id + ' input[data-field]');
      if (first) first.focus();
      announce('Add detail for “' + item.source + '”. Fill in what you know. ' + item.prompt);
      return;
    }
    if (action === 'cancel') {
      state.box = null;
      renderWriting();
      focusSelector = '#write-' + item.id + ' button';
      msg = 'Cancelled. “' + item.source + '” is unchanged.';
    } else if (action === 'save') {
      var values = state.box && state.box.id === item.id ? state.box.values : {};
      if (!anyFilled(item, values)) return; // Save stays disabled with an empty box
      var built = buildFrom(item, values);
      if (built === '') return;
      item.detail = values;
      item.replacement = W.replacementFor(state.original, item, built);
      item.status = 'rewritten';
      state.box = null;
      msg = 'Saved your wording for “' + item.source + '”: ' + item.replacement;
    } else if (action === 'fix') {
      item.detail = null;
      item.replacement = W.replacementFor(state.original, item, item.fix);
      item.status = 'rewritten';
      msg = '“' + item.source + '” is now “' + item.replacement + '” in the reviewed note.';
    } else if (action === 'wignore') {
      item.status = 'ignored';
      item.replacement = null;
      msg = 'Ignored: “' + item.source + '” kept as written.';
    } else if (action === 'wundo') {
      item.status = 'pending';
      item.replacement = null;
      item.detail = null;
      msg = 'Writing suggestion ' + hit.num + ' is to review again.';
    } else {
      return;
    }

    render();
    announce(msg);
    var next = document.querySelector(focusSelector || ('#write-' + item.id + ' button'));
    if (next) next.focus();
  });

  // Live preview while typing. Only the preview and the Save button change.
  el.writingList.addEventListener('input', function (e) {
    var field = e.target.closest('input[data-field]');
    if (!field || !state.box || state.box.id !== field.dataset.id) return;
    state.box.values[field.dataset.field] = field.value;
    var hit = findWriting(field.dataset.id);
    if (hit) refreshBox(hit.s);
  });

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    runCheck();
  });

  el.input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runCheck();
    }
  });

  el.input.addEventListener('input', function () {
    if (!el.error.hidden && el.input.value.trim() !== '') clearError();
    el.stale.hidden = state.original === null || el.input.value === state.original;
  });

  el.example.addEventListener('click', function () {
    el.input.value = EXAMPLE;
    clearError();
    el.stale.hidden = state.original === null;
    el.input.focus();
    announce('Example note loaded. Select Check note to review it.');
  });

  el.clear.addEventListener('click', function () {
    el.input.value = '';
    state = emptyState();
    el.results.hidden = true;
    el.stale.hidden = true;
    clearError();
    el.input.focus();
    announce('Note and results cleared.');
  });

  el.copy.addEventListener('click', function () {
    if (state.original === null) return;
    var text = M.buildReviewed(state.original, mergedSpans());
    var done = function () { announce('Reviewed note copied to clipboard.'); };
    var fail = function () { announce('Copy failed. Select the reviewed note text and copy it manually.'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fail);
      } else { fail(); }
    } catch (err) { fail(); }
  });

  // Expose for manual testing in the console.
  window.CareApp = { getState: function () { return state; }, reviewed: function () {
    return state.original === null ? '' : M.buildReviewed(state.original, mergedSpans());
  } };
})();
