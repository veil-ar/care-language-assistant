# Care Language Assistant — Meadow House

Browser app that reviews wording in **fictional** care notes. It flags the ten workshop care-wording pairs and, in a second layer, the **opinion, speculation, vague and tense** wording that keeps a note from recording what was seen and heard. Every suggestion is explained and can be accepted, rewritten or ignored individually. The checked note is kept as a read-only original; the reviewed version is shown separately.

Omega Digital university hackathon · 19 October 2026.

## Run it

No install, build step, account or API key.

- **Option A:** open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
- **Option B:** serve the folder, for example `python3 -m http.server 8000`, then visit http://localhost:8000.
- **GitHub Pages:** Settings → Pages → deploy from branch `main`, root folder.

## Use it

1. Type or paste a note (or select **Load example note**).
2. Select **Check note** (or press Ctrl/⌘ + Enter).
3. **Care wording suggestions** show the current wording, the suggested wording, a reason and the sentence in context. Select **Accept** or **Ignore**. **Undo** returns it to pending.
4. **Writing suggestions** open with a *Fact check* pill counting the opinion and speculation phrases in the note. Each item explains why the wording is an opinion and asks what to record instead. **Add detail** opens a guided box (actions · exact words · time · who was present · what staff did); the replacement is built **only** from what you type, with a live preview, and **Save** stays disabled while the box is empty. A vague person offers **Add name**; the `have had` tense rule offers **Use "had"**.
5. Compare **Original note** (read-only) and **Reviewed note**. **Copy reviewed note** copies the result.

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

### Writing checks (second layer)

| Rule | How |
| --- | --- |
| Opinion, not fact | Regex built from word lists: link verb (`was`, `seemed`, `being`…) + 0–2 intensifiers (`very`, `really`, `so`…) + one of 113 judgement words, grouped as **behaviour labels**, **emotion attributions** and **general judgements**. Also intensifier + judgement with no link verb (`so angry`) |
| Writer's feelings or speculation | Pattern list with tense variants: `I was confused why`, `I don't know why`, `I thought`, `for no reason`, `out of nowhere`, `must have`, `probably because`, `obviously`… `clearly` only where it carries an opinion, never in "spoke clearly" |
| Vague reference to a person | `a child`, `a young person`, `someone`…, optionally with `I was working with` / `I was supporting` in the same span. The preferred wording (`a person we support`, `a child in care`) is never flagged |
| Tense / grammar | One narrow rule: `have had` followed later in the same sentence by a past-tense verb → use `had`. No general tense correction |
| Longest span first | All layers produce candidates; overlaps are resolved longest-span-first, so `was confused why` beats `was confused` and `being very difficult` beats `very difficult` |
| Never over a care term | Anything overlapping a care-term match is dropped, so the two layers cannot collide |
| Quoted speech | Skipped by the same quote detection as the care layer and reported separately |
| Facts stay facts | Judgement is list-based, so `The room was very warm, 24°C.` is not flagged |
| Never invent a fact | A rewrite is built only from the writer's typed fields, joined with field labels and punctuation. Fitting it to the sentence adjusts punctuation and the case of our own labels only — never a word the writer typed |

## Files

- `matcher.js`: care-wording matching engine (pure functions, runs in browser and Node)
- `writing-checks.js`: writing layers — opinion, speculation, vague person, tense — plus the guided-rewrite builder
- `data/writing-library.js`: word lists, pattern lists and category copy (data only)
- `app.js`: UI state, rendering, accessibility announcements
- `index.html`, `styles.css`: interface
- `tests/judging.test.js`: the ten published judging tests as automated checks
- `tests/writing.test.js`: the writing layers, including no-false-positive checks against all ten judging inputs

## Tests

```
npm test            # both suites
npm run test:judging
npm run test:writing
```

Requires Node 16+ (lookbehind in regular expressions). 26 checks pass: the ten judging scenarios plus a plural/capitalisation check, and the writing layers including the host sentence, quoted speech, and proof that the ten judging inputs produce no writing items that overlap a care term.

## Accessibility

Labelled controls with descriptive accessible names, visible focus rings, keyboard-only operation, an error message linked to the note field (`aria-describedby` and `aria-invalid`), a live status region announcing check results and each Accept/Ignore, and focus moving to the named **Care wording suggestions** heading after checking. The guided rewrite box uses real labelled `<input>` fields and a polite live region for the preview. Text meets 4.5:1 contrast and is at least 13px. The layout works from 390px wide to desktop without horizontal scrolling.

## Data

Fictional people and care data only. Do not enter real care records.
