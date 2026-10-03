/**
 * Key-name transformations: word splitting, case conversion and identifier
 * helpers. Pure string work, no DOM, no state.
 */

/** Case modes offered in the UI. */
export const CaseMode = {
  NONE: 'none',
  CAMEL: 'camel',
  PASCAL: 'pascal',
  SNAKE: 'snake',
  CONSTANT: 'constant',
  KEBAB: 'kebab',
  DOT: 'dot',
  LOWER: 'lower',
  UPPER: 'upper',
};

export const CASE_LABELS = {
  [CaseMode.NONE]: 'Keep as-is',
  [CaseMode.CAMEL]: 'camelCase',
  [CaseMode.PASCAL]: 'PascalCase',
  [CaseMode.SNAKE]: 'snake_case',
  [CaseMode.CONSTANT]: 'CONSTANT_CASE',
  [CaseMode.KEBAB]: 'kebab-case',
  [CaseMode.DOT]: 'dot.case',
  [CaseMode.LOWER]: 'lowercase',
  [CaseMode.UPPER]: 'UPPERCASE',
};

/**
 * Split a key into lower-cased words.
 *
 * Handles camelCase, PascalCase, SCREAMING_SNAKE, kebab-case, dots, spaces and
 * acronym runs: `HTTPStatusCode` -> ['http', 'status', 'code'].
 * Digits stay attached to the word they follow, so `field1Name` -> ['field1', 'name']
 * and `field1` is left alone.
 */
export function splitWords(input) {
  return String(input)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Convert a key to the requested case.
 *
 * @param {string} input
 * @param {string} mode one of {@link CaseMode}
 */
export function applyCase(input, mode) {
  const text = String(input);
  if (!mode || mode === CaseMode.NONE) return text;
  if (mode === CaseMode.LOWER) return text.toLowerCase();
  if (mode === CaseMode.UPPER) return text.toUpperCase();

  const words = splitWords(text);
  if (words.length === 0) return text;

  switch (mode) {
    case CaseMode.CAMEL:
      return words[0] + words.slice(1).map(capitalize).join('');
    case CaseMode.PASCAL:
      return words.map(capitalize).join('');
    case CaseMode.SNAKE:
      return words.join('_');
    case CaseMode.CONSTANT:
      return words.join('_').toUpperCase();
    case CaseMode.KEBAB:
      return words.join('-');
    case CaseMode.DOT:
      return words.join('.');
    default:
      return text;
  }
}

/** True when the text can be used as a bare JS/TS identifier. */
export function isValidIdentifier(text) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text);
}

/** True when the text can appear unquoted as a SQL column or CSV header. */
export function isValidBareName(text) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text);
}

/**
 * Build a type name usable in generated code: PascalCase, starting with a
 * letter, no punctuation.
 */
export function toTypeName(input, fallback = 'Root') {
  const words = splitWords(input);
  let name = words.map(capitalize).join('');
  if (!name) name = fallback;
  if (!/^[A-Za-z_$]/.test(name)) name = `${fallback}${name}`;
  return name;
}

/** Escape a value for a double-quoted JS/TS/JSON string literal, without quotes. */
export function escapeDoubleQuoted(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\u0000-\u001f\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Escape a value for a single-quoted JS/TS/Python string literal, without quotes. */
export function escapeSingleQuoted(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Closing counterpart of an opening bracket, so a one-sided wrapper balances. */
const CLOSING_PAIRS = new Map([
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
  ['<', '>'],
  ['«', '»'],
  ['‹', '›'],
  ['❛', '❜'],
  ['❝', '❞'],
  ['“', '”'],
  ['‘', '’'],
  ['「', '」'],
  ['《', '》'],
  ['【', '】'],
]);

/**
 * The closing counterpart of an opening bracket, or `null` when the character
 * has no pair (so `"` mirrors to `"` but `[` completes to `]`).
 */
export function closingFor(left) {
  return CLOSING_PAIRS.get(left) ?? null;
}

/**
 * Wrap a key in the configured characters.
 *
 * `right` is optional. When it is missing the wrapper either completes a known
 * bracket pair or mirrors the left side, so `{ left: '"' }` and `{ left: '[' }`
 * both do the obvious thing. An explicitly empty `right` is respected, so an
 * asymmetric wrapper is never guessed at.
 */
export function wrapKey(key, wrapper) {
  const left = wrapper?.left ?? '';
  if (wrapper?.right !== undefined) return `${left}${key}${wrapper.right}`;
  return `${left}${key}${closingFor(left) ?? left}`;
}

/**
 * Quote a key only when the target language requires it.
 *
 * @param {string} key
 * @param {'double'|'single'|'backtick'|'bracket'} style
 */
export function quoteIfNeeded(key, style = 'double') {
  if (isValidIdentifier(key) && style !== 'bracket') return key;
  const escape = style === 'single' ? escapeSingleQuoted : escapeDoubleQuoted;
  const escaped = escape(key);
  if (style === 'single') return `'${escaped}'`;
  if (style === 'backtick') return `\`${String(key).replace(/`/g, '\\`')}\``;
  if (style === 'bracket') return `["${escaped}"]`;
  return `"${escaped}"`;
}
