(function () {
  'use strict';

  var M = window.CareMatcher;

  var EXAMPLE = 'At 18:40, Alex reported that the client pushed Sam and left a bruise. ' +
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
    original: document.getElementById('original-text'),
    reviewed: document.getElementById('reviewed-text'),
    changeCount: document.getElementById('change-count'),
    copy: document.getElementById('copy-btn')
  };

  // Single source of truth. Original is a frozen snapshot; reviewed is derived.
  var state = { original: null, suggestions: [], quoted: [] };

  var STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', ignored: 'Ignored' };

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
    state = { original: text, suggestions: result.suggestions, quoted: result.quoted };

    el.results.hidden = false;
    render();

    var n = state.suggestions.length;
    announce(n === 0
      ? 'Check complete. No care terms found.'
      : 'Check complete. ' + plural(n, 'suggestion', 'suggestions') + ' found. The original note has not been changed.');
    el.heading.focus();
  }

  /* ---------- Rendering ---------- */
  function render() {
    renderSummary();
    renderList();
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
        node.className = 'flag is-' + seg.suggestion.status;
        node.textContent = seg.text;
      } else {
        node = document.createTextNode(seg.text); // pending/ignored in reviewed: unchanged text
      }
      target.appendChild(node);
    });
  }

  function renderVersions() {
    paint(el.original, M.segments(state.original, state.suggestions, 'original'));
    paint(el.reviewed, M.segments(state.original, state.suggestions, 'reviewed'));
    var a = counts().accepted;
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
    state = { original: null, suggestions: [], quoted: [] };
    el.results.hidden = true;
    el.stale.hidden = true;
    clearError();
    el.input.focus();
    announce('Note and results cleared.');
  });

  el.copy.addEventListener('click', function () {
    if (state.original === null) return;
    var text = M.buildReviewed(state.original, state.suggestions);
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
    return state.original === null ? '' : M.buildReviewed(state.original, state.suggestions);
  } };
})();
