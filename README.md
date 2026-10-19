# Care Language Assistant — Meadow House

Browser app that reviews wording in **fictional** care notes. It flags the ten workshop care-wording pairs, explains each suggestion, and lets the writer **Accept** or **Ignore** every occurrence individually. The checked note is kept as a read-only original; the reviewed version is shown separately.

Omega Digital university hackathon · 19 October 2026.

## Run it

No install, build step, account or API key.

- **Option A:** open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
- **Option B:** serve the folder, for example `python3 -m http.server 8000`, then visit http://localhost:8000.
- **GitHub Pages:** Settings → Pages → deploy from branch `main`, root folder.

## Use it

1. Type or paste a note (or select **Load example note**).
2. Select **Check note** (or press Ctrl/⌘ + Enter).
3. Each suggestion shows the current wording, the suggested wording, a reason and the sentence in context. Select **Accept** or **Ignore**. **Undo** returns it to pending.
4. Compare **Original note** (read-only) and **Reviewed note**. **Copy reviewed note** copies the result.

Checking a new note discards all earlier accepted and ignored decisions.

## Rules implemented

| Rule | How |
| --- | --- |
| Ten assessed pairs | `service user(s)`, `client(s)`, `family contact`, `contact centre`, `care leaver`, `foster placement`, `residential placement`, `looked-after child`, plus plural forms (`care leavers`, `foster placements`, `looked-after children`…) |
| Longer phrases first | One regex with alternatives sorted longest-first |
| Whole words only | Unicode letter/digit look-arounds: `client` never matches `clientele` |
| Uppercase / repeats | Case-insensitive; every occurrence is a separate suggestion; replacement keeps the source's case (`CLIENT` → `PERSON WE SUPPORT`) |
| Quoted speech | Straight `"…"` and curly `“…”` spans are detected first; terms inside are never flagged or changed |
| Never auto-edit | Checking changes nothing. The reviewed text is **derived** from the frozen original plus accepted offsets, so names, times, actions, injuries and attribution cannot be altered |
| Reset | Every check replaces all state |

## Files

- `matcher.js`: matching engine (pure functions, runs in browser and Node)
- `app.js`: UI state, rendering, accessibility announcements
- `index.html`, `styles.css`: interface
- `tests/judging.test.js`: the ten published judging tests as automated checks

## Tests

```
node tests/judging.test.js
```

Requires Node 16+. All ten judging scenarios pass, plus an extra plural/capitalisation check.

## Accessibility

Labelled controls with descriptive accessible names, visible focus rings, keyboard-only operation, an error message linked to the note field (`aria-describedby` and `aria-invalid`), a live status region announcing check results and each Accept/Ignore, and focus moving to the named **Suggestions** heading after checking. Text meets 4.5:1 contrast and is at least 13px. The layout works from 390px wide to desktop without horizontal scrolling.

## Data

Fictional people and care data only. Do not enter real care records.
