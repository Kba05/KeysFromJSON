/**
 * JSON input handling for KeysFromJson.
 *
 * Responsibilities:
 *  - parse strict JSON quickly (native `JSON.parse` on the happy path);
 *  - when parsing fails, explain *why*, with a line, a column and a caret
 *    snippet, using our own parser. This matters because V8's message only
 *    sometimes carries a position — `{"a": 1, "b": ,}` reports
 *    `Unexpected token ',', ...` with no location at all;
 *  - recognise the mistakes developers actually paste (trailing commas, single
 *    quotes, unquoted keys, comments, typographic quotes) so the UI can offer a
 *    one-click repair;
 *  - accept NDJSON / JSON Lines as several documents.
 *
 * Nothing in this module throws at the caller: every entry point returns a
 * result object. The previous implementation called `JSON.parse` straight from
 * a click handler, so bad input died as an uncaught SyntaxError and the page
 * simply looked broken.
 */

/** Why a document was rejected. The UI maps these to a repair suggestion. */
export const ParseCode = {
  EMPTY: 'EMPTY',
  TOO_LARGE: 'TOO_LARGE',
  TOO_DEEP: 'TOO_DEEP',
  TRAILING_COMMA: 'TRAILING_COMMA',
  SINGLE_QUOTE: 'SINGLE_QUOTE',
  UNQUOTED_KEY: 'UNQUOTED_KEY',
  COMMENT: 'COMMENT',
  SMART_QUOTE: 'SMART_QUOTE',
  UNTERMINATED_STRING: 'UNTERMINATED_STRING',
  UNEXPECTED_EOF: 'UNEXPECTED_EOF',
  UNEXPECTED_TOKEN: 'UNEXPECTED_TOKEN',
};

const MESSAGE_BY_CODE = {
  [ParseCode.EMPTY]: 'Nothing to parse — the input is empty',
  [ParseCode.TOO_LARGE]: 'Document is too large to process in the browser',
  [ParseCode.TOO_DEEP]: 'Nesting is too deep',
  [ParseCode.TRAILING_COMMA]: 'Trailing comma before a closing bracket',
  [ParseCode.SINGLE_QUOTE]: 'Single-quoted string — JSON requires double quotes',
  [ParseCode.UNQUOTED_KEY]: 'Unquoted property name — JSON requires double quotes',
  [ParseCode.COMMENT]: 'Comments are not allowed in JSON',
  [ParseCode.SMART_QUOTE]: 'Typographic quote used instead of a straight double quote',
  [ParseCode.UNTERMINATED_STRING]: 'Unterminated string',
  [ParseCode.UNEXPECTED_EOF]: 'Unexpected end of input — a brace or bracket is not closed',
  [ParseCode.UNEXPECTED_TOKEN]: 'Unexpected token',
};

/** Codes that "Repair JSON" can fix automatically. */
const REPAIRABLE_CODES = new Set([
  ParseCode.TRAILING_COMMA,
  ParseCode.SINGLE_QUOTE,
  ParseCode.UNQUOTED_KEY,
  ParseCode.COMMENT,
  ParseCode.SMART_QUOTE,
]);

/** Guards against turning a pathological paste into a frozen tab. */
const MAX_DEPTH = 512;
const MAX_LENGTH = 32 * 1024 * 1024;

const STRICT_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const RELAXED_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const BARE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*/;

const SMART_QUOTES = new Set(['\u201c', '\u201d', '\u201e', '\u201f', '\u00ab', '\u00bb', '\u2018', '\u2019', '\u201a']);

class ParseFailure extends Error {
  constructor(code, position) {
    super(code);
    this.name = 'ParseFailure';
    this.code = code;
    this.position = position;
  }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function fail(state, code, position = state.i) {
  throw new ParseFailure(code, position);
}

/* ------------------------------------------------------------------ *
 * Position reporting
 * ------------------------------------------------------------------ */

/**
 * Turn a character offset into a 1-based line and column, the offending source
 * line and a caret marker that lines up under it.
 *
 * @param {string} text
 * @param {number} position
 */
export function locate(text, position) {
  const clamped = Math.max(0, Math.min(Number.isFinite(position) ? position : 0, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < clamped; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  let lineEnd = text.indexOf('\n', clamped);
  if (lineEnd === -1) lineEnd = text.length;
  const column = clamped - lineStart + 1;
  let raw = text.slice(lineStart, lineEnd).replace(/\r$/, '');

  // Keep the snippet short but centred on the error so the caret stays useful.
  const MAX_SNIPPET = 160;
  let trimmedFromStart = 0;
  if (raw.length > MAX_SNIPPET) {
    const half = Math.floor(MAX_SNIPPET / 2);
    trimmedFromStart = Math.max(0, column - 1 - half);
    raw = `${trimmedFromStart > 0 ? '…' : ''}${raw.slice(trimmedFromStart, trimmedFromStart + MAX_SNIPPET)}${
      trimmedFromStart + MAX_SNIPPET < text.slice(lineStart, lineEnd).length ? '…' : ''
    }`;
  }
  const caretColumn = Math.max(0, column - 1 - trimmedFromStart);

  return {
    line,
    column,
    snippet: raw,
    caret: `${' '.repeat(caretColumn)}^`,
  };
}

/** Build the public error payload for a failure code at a character offset. */
export function describe(text, code, position) {
  const location = locate(text, position);
  return {
    code,
    message: MESSAGE_BY_CODE[code] || 'Invalid JSON',
    position: Math.max(0, Math.min(position ?? 0, text.length)),
    repairable: REPAIRABLE_CODES.has(code),
    ...location,
  };
}

/* ------------------------------------------------------------------ *
 * Parser
 *
 * One recursive-descent parser serves both modes. `tolerant` decides whether an
 * extension is accepted or reported as a failure with a repair hint, so the
 * detection logic exists exactly once.
 * ------------------------------------------------------------------ */

function skipWhitespace(state) {
  const { text } = state;
  while (state.i < text.length) {
    const ch = text[state.i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      state.i += 1;
      continue;
    }
    if (ch === '/' && text[state.i + 1] === '/') {
      if (!state.tolerant) fail(state, ParseCode.COMMENT);
      while (state.i < text.length && text[state.i] !== '\n') state.i += 1;
      continue;
    }
    if (ch === '/' && text[state.i + 1] === '*') {
      if (!state.tolerant) fail(state, ParseCode.COMMENT);
      state.i += 2;
      while (state.i < text.length && !(text[state.i] === '*' && text[state.i + 1] === '/')) state.i += 1;
      state.i = Math.min(state.i + 2, text.length);
      continue;
    }
    break;
  }
}

function parseValue(state, depth) {
  if (depth > MAX_DEPTH) fail(state, ParseCode.TOO_DEEP);
  skipWhitespace(state);

  const ch = state.text[state.i];
  if (ch === undefined) fail(state, ParseCode.UNEXPECTED_EOF);
  if (ch === '{') return parseObject(state, depth);
  if (ch === '[') return parseArray(state, depth);
  if (ch === '"') return parseString(state, '"');
  if (ch === "'") {
    if (state.tolerant) return parseString(state, "'");
    fail(state, ParseCode.SINGLE_QUOTE);
  }
  if (SMART_QUOTES.has(ch)) fail(state, ParseCode.SMART_QUOTE);
  if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber(state);
  if (state.text.startsWith('true', state.i)) {
    state.i += 4;
    return true;
  }
  if (state.text.startsWith('false', state.i)) {
    state.i += 5;
    return false;
  }
  if (state.text.startsWith('null', state.i)) {
    state.i += 4;
    return null;
  }
  if (state.tolerant) {
    if (state.text.startsWith('NaN', state.i)) {
      state.i += 3;
      return NaN;
    }
    if (state.text.startsWith('Infinity', state.i)) {
      state.i += 8;
      return Infinity;
    }
    if (state.text.startsWith('undefined', state.i)) {
      state.i += 9;
      return undefined;
    }
  }
  return fail(state, ParseCode.UNEXPECTED_TOKEN);
}

function parseObject(state, depth) {
  state.i += 1; // consume '{'
  const result = {};
  skipWhitespace(state);
  if (state.text[state.i] === '}') {
    state.i += 1;
    return result;
  }

  for (;;) {
    skipWhitespace(state);
    const ch = state.text[state.i];
    if (ch === undefined) fail(state, ParseCode.UNEXPECTED_EOF);

    let key;
    if (ch === '"') {
      key = parseString(state, '"');
    } else if (ch === "'") {
      if (!state.tolerant) fail(state, ParseCode.SINGLE_QUOTE);
      key = parseString(state, "'");
    } else if (state.tolerant) {
      const match = BARE_KEY.exec(state.text.slice(state.i));
      if (!match) fail(state, ParseCode.UNQUOTED_KEY);
      key = match[0];
      state.i += key.length;
    } else {
      fail(state, ParseCode.UNQUOTED_KEY);
    }

    skipWhitespace(state);
    if (state.text[state.i] !== ':') fail(state, ParseCode.UNEXPECTED_TOKEN);
    state.i += 1;
    result[key] = parseValue(state, depth + 1);

    skipWhitespace(state);
    const next = state.text[state.i];
    if (next === ',') {
      const commaAt = state.i;
      state.i += 1;
      skipWhitespace(state);
      if (state.text[state.i] === '}') {
        if (!state.tolerant) fail(state, ParseCode.TRAILING_COMMA, commaAt);
        // Tolerant mode drops the comma and closes the object right here.
        // Falling through to `continue` would try to read another key at the brace.
        state.i += 1;
        return result;
      }
      continue;
    }
    if (next === '}') {
      state.i += 1;
      return result;
    }
    if (next === undefined) fail(state, ParseCode.UNEXPECTED_EOF);
    fail(state, ParseCode.UNEXPECTED_TOKEN);
  }
}

function parseArray(state, depth) {
  state.i += 1; // consume '['
  const result = [];
  skipWhitespace(state);
  if (state.text[state.i] === ']') {
    state.i += 1;
    return result;
  }

  for (;;) {
    result.push(parseValue(state, depth + 1));
    skipWhitespace(state);
    const next = state.text[state.i];
    if (next === ',') {
      const commaAt = state.i;
      state.i += 1;
      skipWhitespace(state);
      if (state.text[state.i] === ']') {
        if (!state.tolerant) fail(state, ParseCode.TRAILING_COMMA, commaAt);
        // Same as objects: a trailing comma ends the array in tolerant mode.
        state.i += 1;
        return result;
      }
      continue;
    }
    if (next === ']') {
      state.i += 1;
      return result;
    }
    if (next === undefined) fail(state, ParseCode.UNEXPECTED_EOF);
    fail(state, ParseCode.UNEXPECTED_TOKEN);
  }
}

function parseString(state, quote) {
  const { text } = state;
  const start = state.i;
  state.i += 1; // consume the opening quote
  let out = '';

  for (;;) {
    if (state.i >= text.length) fail(state, ParseCode.UNTERMINATED_STRING, start);
    const ch = text[state.i];

    if (ch === quote) {
      state.i += 1;
      return out;
    }

    if (ch === '\\') {
      state.i += 1;
      const esc = text[state.i];
      if (esc === undefined) fail(state, ParseCode.UNTERMINATED_STRING, start);
      switch (esc) {
        case '"':
        case "'":
        case '\\':
        case '/':
          out += esc;
          break;
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case 'n':
          out += '\n';
          break;
        case 'r':
          out += '\r';
          break;
        case 't':
          out += '\t';
          break;
        case 'u': {
          const hex = text.slice(state.i + 1, state.i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(state, ParseCode.UNEXPECTED_TOKEN);
          out += String.fromCharCode(Number.parseInt(hex, 16));
          state.i += 4;
          break;
        }
        default:
          if (!state.tolerant) fail(state, ParseCode.UNEXPECTED_TOKEN);
          out += esc;
      }
      state.i += 1;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      if (!state.tolerant) fail(state, ParseCode.UNTERMINATED_STRING, start);
    } else if (ch.charCodeAt(0) < 0x20 && !state.tolerant) {
      fail(state, ParseCode.UNEXPECTED_TOKEN);
    }

    out += ch;
    state.i += 1;
  }
}

function parseNumber(state) {
  const rest = state.text.slice(state.i);
  const match = (state.tolerant ? RELAXED_NUMBER : STRICT_NUMBER).exec(rest);
  if (!match) fail(state, ParseCode.UNEXPECTED_TOKEN);
  state.i += match[0].length;
  return Number(match[0]);
}

function run(text, tolerant) {
  const source = stripBom(String(text ?? ''));
  if (!source.trim()) return { ok: false, value: undefined, error: describe(source, ParseCode.EMPTY, 0) };
  if (source.length > MAX_LENGTH) {
    return { ok: false, value: undefined, error: describe(source, ParseCode.TOO_LARGE, 0) };
  }

  const state = { text: source, i: 0, tolerant };
  try {
    skipWhitespace(state);
    const value = parseValue(state, 0);
    skipWhitespace(state);
    if (state.i < source.length) fail(state, ParseCode.UNEXPECTED_TOKEN);
    return { ok: true, value, error: null };
  } catch (error) {
    if (error instanceof ParseFailure) {
      return { ok: false, value: undefined, error: describe(source, error.code, error.position) };
    }
    throw error;
  }
}

/** Parse strict JSON, reporting our own diagnostics on failure. */
export function parseStrict(text) {
  return run(text, false);
}

/** Parse JSON with the common developer extensions allowed (JSON5-ish subset). */
export function parseRelaxed(text) {
  return run(text, true);
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Strict parse with a native fast path.
 *
 * `JSON.parse` handles valid input at native speed; only on failure do we run
 * our own parser so the user gets a location and a repair hint.
 *
 * @param {string} text
 * @returns {{ok: boolean, value: unknown, error: object|null}}
 */
export function parseJson(text) {
  const source = stripBom(String(text ?? ''));
  if (!source.trim()) return { ok: false, value: undefined, error: describe(source, ParseCode.EMPTY, 0) };
  if (source.length > MAX_LENGTH) {
    return { ok: false, value: undefined, error: describe(source, ParseCode.TOO_LARGE, 0) };
  }

  try {
    return { ok: true, value: JSON.parse(source), error: null };
  } catch {
    // Fall through: we can do better than the native message.
  }

  const strict = parseStrict(source);
  if (strict.ok) return strict;

  // Only offer a repair when the relaxed parser really can recover the value.
  strict.error.repairable = strict.error.repairable && parseRelaxed(source).ok;
  return strict;
}

/**
 * Parse NDJSON / JSON Lines: one document per non-empty line.
 *
 * @param {string} text
 * @returns {{ok: boolean, docs: unknown[], format: string|null, error: object|null, failedLine?: number}}
 */
export function parseNdjson(text) {
  const source = stripBom(String(text ?? ''));
  const docs = [];
  let offset = 0;
  let lineNumber = 0;

  while (offset <= source.length) {
    let lineEnd = source.indexOf('\n', offset);
    if (lineEnd === -1) lineEnd = source.length;

    let line = source.slice(offset, lineEnd);
    const hadCr = line.endsWith('\r');
    if (hadCr) line = line.slice(0, -1);
    const trimmed = line.trim();

    if (trimmed) {
      const result = parseJson(trimmed);
      if (!result.ok) {
        // Report against the whole document so line numbers match what the user sees.
        const shift = offset + line.indexOf(trimmed);
        const error = describe(source, result.error.code, result.error.position + shift);
        error.repairable = result.error.repairable;
        return { ok: false, docs, format: null, error, failedLine: lineNumber + 1 };
      }
      docs.push(result.value);
    }

    lineNumber += 1;
    if (lineEnd === source.length) break;
    offset = lineEnd + 1;
  }

  if (docs.length === 0) {
    return { ok: false, docs: [], format: null, error: describe(source, ParseCode.EMPTY, 0) };
  }
  return { ok: true, docs, format: 'ndjson', error: null };
}

/**
 * Parse user input into one or more documents.
 *
 * @param {string} text
 * @param {{mode?: 'auto'|'json'|'ndjson'|'relaxed'}} [options]
 */
export function parseDocuments(text, options = {}) {
  const mode = options.mode || 'auto';
  const source = stripBom(String(text ?? ''));

  if (!source.trim()) {
    return { ok: false, docs: [], format: null, error: describe(source, ParseCode.EMPTY, 0) };
  }

  if (mode === 'relaxed') {
    const result = parseRelaxed(source);
    return result.ok
      ? { ok: true, docs: [result.value], format: 'json', error: null }
      : { ok: false, docs: [], format: null, error: result.error };
  }

  if (mode === 'ndjson') return parseNdjson(source);

  const whole = parseJson(source);
  if (whole.ok) return { ok: true, docs: [whole.value], format: 'json', error: null };
  if (mode === 'json') return { ok: false, docs: [], format: null, error: whole.error };

  // auto: a pasted log or API dump is the usual second guess
  const ndjson = parseNdjson(source);
  if (ndjson.ok) return ndjson;
  return { ok: false, docs: [], format: null, error: whole.error };
}

/* ------------------------------------------------------------------ *
 * Output helpers
 * ------------------------------------------------------------------ */

/** Serialise with a 0-10 space indent, or a tab. */
export function stringifyJson(value, indent = 2) {
  return JSON.stringify(value, null, indent === 'tab' ? '\t' : indent) ?? '';
}

/** Rewrite input into valid JSON, fixing the mistakes we can detect. */
export function repairJson(text, indent = 2) {
  const result = parseRelaxed(text);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, text: stringifyJson(result.value, indent) };
}
