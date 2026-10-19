/*
 * Care Language Assistant — writing library
 * Word lists and category copy for the pattern-based writing checks.
 * Data only: no regex building, no matching. Works in the browser
 * (window.CareWritingLibrary) and in Node (module.exports).
 *
 * Patterns elsewhere may use the placeholders {LINK}, {INT} and {JUDGEMENT};
 * writing-checks.js substitutes them with the alternations built from these lists.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CareWritingLibrary = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Linking verbs that attach a judgement to a person: "was difficult", "seemed fine".
  var LINK_VERBS = [
    'was', 'were', 'is', 'are', 'be', 'being', 'been',
    'seemed', 'seems', 'appeared', 'appears',
    'looked', 'looks', 'became', 'becomes',
    'got', 'gets', 'getting', 'acting', 'acted', 'felt like'
  ];

  // Optional boosters. 0-2 may sit between the link verb and the judgement.
  var INTENSIFIERS = [
    'very', 'really', 'so', 'extremely', 'quite', 'a bit', 'a little', 'rather',
    'totally', 'completely', 'absolutely', 'super', 'incredibly', 'particularly',
    'fairly', 'pretty'
  ];

  // Judgement words, grouped so each group can carry its own message.
  var JUDGEMENTS = {
    behaviour: [
      'difficult', 'challenging', 'naughty', 'rude', 'cheeky', 'defiant', 'disruptive',
      'aggressive', 'violent', 'manipulative', 'attention-seeking', 'non-compliant',
      'uncooperative', 'oppositional', 'stubborn', 'lazy', 'silly', 'spoilt', 'bratty',
      'hyper', 'wild', 'out of control', 'kicking off', 'playing up', 'acting out',
      'unreasonable', 'demanding', 'nasty', 'mean', 'horrible', 'awful', 'a nightmare',
      'impossible', 'hard work', 'trouble', 'a handful', 'argumentative',
      'confrontational', 'destructive', 'threatening', 'obstructive', 'badly behaved'
    ],
    emotion: [
      'angry', 'furious', 'mad', 'cross', 'upset', 'sad', 'happy', 'fine', 'ok', 'okay',
      'alright', 'anxious', 'nervous', 'scared', 'frightened', 'worried', 'stressed',
      'agitated', 'unsettled', 'distressed', 'hysterical', 'moody', 'grumpy', 'low',
      'depressed', 'excited', 'calm', 'settled', 'content', 'frustrated', 'annoyed',
      'irritable', 'jealous', 'embarrassed', 'confused', 'bored', 'unhappy', 'miserable',
      'fed up', 'overwhelmed', 'panicky', 'defensive', 'emotional', 'withdrawn',
      'flat', 'hostile'
    ],
    general: [
      'good', 'bad', 'better', 'worse', 'great', 'lovely', 'nice', 'pleasant',
      'unpleasant', 'inappropriate', 'appropriate', 'normal', 'weird', 'strange',
      'odd', 'off', 'terrible', 'rubbish', 'poor', 'brilliant', 'amazing', 'fantastic',
      'unacceptable', 'acceptable', 'typical'
    ]
  };

  /*
   * Narrow "not followed by" guards for judgement words with a common literal use.
   * Keyed by the judgement word, value is an alternation of following words.
   */
  var JUDGEMENT_GUARDS = {
    'off': 'duty|sick|site|school|work|rota|shift',
    'low': 'chair|bed|wall|table|shelf',
    'content': 'of|warning'
  };

  /*
   * Writer's feelings or speculation.
   * "I" is required where dropping it would collide with an emotion attribution
   * (so "Sam was worried" stays an emotion, while "I was worried" is the writer's).
   */
  var SPECULATION_PATTERNS = [
    "(?:I\\s+(?:was|am|were|feel|felt|get|got)|I'm)\\s+confused(?:\\s+why)?",
    "(?:was|were|is|feel|felt|got)\\s+confused\\s+why",
    "(?:I\\s+)?(?:don't|do not|didn't|did not|doesn't|does not)\\s+know\\s+why",
    "(?:(?:I\\s+(?:am|was|were)|I'm)\\s+)?not\\s+sure\\s+why",
    "(?:I\\s+)?(?:have\\s+|had\\s+)?no\\s+idea\\s+why",
    "I\\s+(?:feel|felt|think|thought|believe|believed|guess|guessed|assume|assumed|suspect|suspected|reckon|reckoned|wonder|wondered)",
    "(?:I\\s+(?:was|were|am|got|felt)|I'm)\\s+(?:{INT}\\s+)?(?:surprised|shocked|worried|concerned|unsure|taken aback)",
    "it\\s+(?:seemed|seems|appeared|appears|felt|feels)\\s+like",
    "for\\s+no\\s+(?:apparent\\s+)?reason",
    "out\\s+of\\s+nowhere",
    "out\\s+of\\s+the\\s+blue",
    "for\\s+some\\s+reason",
    "obviously",
    "presumably",
    // "clearly" only where it carries an opinion: sentence-initial, or in front of a
    // judgement. "Sam spoke clearly" is a description and stays unflagged.
    "clearly(?=[,:]?\\s+(?:[\\w']+\\s+){0,2}(?:{LINK}|{JUDGEMENT}))",
    "(?<=^|[.!?][\"'\\u201D\\u2019]?\\s)clearly",
    "must\\s+have",
    "(?:probably|possibly|maybe)\\s+because"
  ];

  /*
   * Vague reference to a person. The optional tail keeps the whole phrase in one span
   * ("a child I was working with"). Guards keep the preferred wording unflagged
   * ("a person we support", "a child in care").
   */
  var PERSON_PATTERNS = [
    "(?:a\\s+(?:child(?!\\s+in\\s+care)|young\\s+person|resident|person(?!\\s+we\\s+support)|boy|girl|kid|lad|lass)" +
      "|one\\s+of\\s+the\\s+(?:kids|children|residents|young\\s+people|girls|boys)" +
      "|someone|somebody)" +
      "(?:\\s+(?:I|we|staff)\\s+(?:was|were|am|are)\\s+(?:working\\s+with|supporting|looking\\s+after|with))?"
  ];

  /*
   * Past-tense verbs used only by the narrow "have had" tense rule: "have had" is
   * flagged when a completed past action follows it in the same sentence.
   */
  var PAST_VERBS = [
    'was', 'were', 'had', 'did', 'went', 'said', 'came', 'got', 'saw', 'told', 'took',
    'left', 'threw', 'made', 'ran', 'felt', 'became', 'put', 'gave', 'began', 'found',
    'knew', 'thought', 'heard', 'kept', 'sat', 'stood', 'held', 'hit', 'broke', 'spoke',
    'ate', 'drank', 'slept', 'woke', 'rang', 'wrote'
  ];

  var CATEGORIES = {
    behaviour: {
      id: 'behaviour',
      kind: 'opinion',
      name: 'Opinion, not fact',
      message: 'Opinion, not fact: this labels the behaviour. Describe what was seen and heard.',
      prompt: 'What exactly did they do or say? When, and for how long?',
      example: "shouted 'leave me alone' three times and threw a cup at the wall at 16:10"
    },
    emotion: {
      id: 'emotion',
      kind: 'opinion',
      name: 'Opinion, not fact',
      message: 'Opinion, not fact: this assumes how they felt. Record the signs you observed.',
      prompt: 'What did you see or hear that showed this (words, tone, facial expression, actions)?',
      example: "raised voice, clenched fists, said 'I hate it here'"
    },
    general: {
      id: 'general',
      kind: 'opinion',
      name: 'Opinion, not fact',
      message: 'Opinion, not fact: describe what happened instead of judging it.',
      prompt: 'What happened? Record the actions, the words used and the time.',
      example: 'ate dinner at 17:30 and watched television with staff until 19:00'
    },
    speculation: {
      id: 'speculation',
      kind: 'speculation',
      name: "Writer's feelings or speculation",
      message: 'This records your reaction or a guess, not what happened. Record the facts. ' +
        'If a possible trigger is relevant, write what you observed just before.',
      prompt: 'What happened immediately before? What did they say about why?',
      example: "Before this, Sam was told the family time was cancelled. Sam said 'it's not fair'."
    },
    person: {
      id: 'person',
      kind: 'person',
      name: 'Vague reference to a person',
      message: 'Name who this is about (use the fictional name or initials).',
      prompt: 'Who is this note about?',
      example: 'Sam (fictional)'
    },
    tense: {
      id: 'tense',
      kind: 'tense',
      name: 'Tense / grammar',
      message: "Use simple past for a completed event: 'had' / 'was'.",
      prompt: 'Rewrite the opening as a completed past event.',
      example: 'had',
      fix: 'had'
    }
  };

  // Labelled fields of the guided rewrite box, in the order they are joined.
  var DETAIL_FIELDS = [
    { id: 'actions', label: 'What happened (actions)?', placeholder: 'e.g. stood up, pushed the chair back, walked out' },
    { id: 'said', label: 'What was said (exact words)?', placeholder: "e.g. I'm not going" },
    { id: 'when', label: 'When (time)?', placeholder: 'e.g. 16:10' },
    { id: 'present', label: 'Who was present?', placeholder: 'e.g. Sam, one staff member' },
    { id: 'staff', label: 'What did staff do?', placeholder: 'e.g. stayed nearby and offered a drink' }
  ];

  return {
    LINK_VERBS: LINK_VERBS,
    INTENSIFIERS: INTENSIFIERS,
    JUDGEMENTS: JUDGEMENTS,
    JUDGEMENT_GUARDS: JUDGEMENT_GUARDS,
    SPECULATION_PATTERNS: SPECULATION_PATTERNS,
    PERSON_PATTERNS: PERSON_PATTERNS,
    PAST_VERBS: PAST_VERBS,
    CATEGORIES: CATEGORIES,
    DETAIL_FIELDS: DETAIL_FIELDS
  };
});
