/**
 * Regression tests for src/core/json-parse.js.
 *
 * These lock down the diagnostics the original single-file tool did not have:
 * every entry point returns a result object, a failure carries a code, a line,
 * a column and a caret, and the mistakes developers actually paste are named
 * well enough to be repaired in one click.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  locate,
  parseDocuments,
  parseJson,
  repairJson,
} from '../src/core/json-parse.js';

/** Every input used by the "never throws" test below. */
const ALL_INPUTS = [
  '{"a": 1}',
  '',
  '   ',
  '{"a": 1,}',
  '{\n  "a": 1,\n  "b": ,\n}',
  "{'a': 1}",
  '{a: 1}',
  '{"a": 1} // trailing comment',
  '{"a": 1 /* c */}',
  '{"a": \u201cx\u201d}',
  '{"a": "x}',
  '[1,2',
];

test('parseJson accepts strict JSON', () => {
  const result = parseJson('{"a": 1}');
  assert.equal(result.ok, true);
  assert.equal(result.value.a, 1);
  assert.equal(result.error, null);
});

test('parseJson reports EMPTY for blank input', () => {
  for (const input of ['', '   ']) {
    const result = parseJson(input);
    assert.equal(result.ok, false, `expected ${JSON.stringify(input)} to fail`);
    assert.equal(result.error.code, 'EMPTY');
  }
});

test('parseJson reports a trailing comma with a caret under the comma', () => {
  const input = '{"a": 1,}';
  const result = parseJson(input);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TRAILING_COMMA');
  assert.equal(result.error.line, 1);
  assert.equal(result.error.repairable, true);
  assert.equal(result.error.snippet, input);

  // The comma sits at index 7 of this input, so its 1-based column is 8 and the
  // caret is seven spaces followed by '^'. (The task brief said "index 8 ->
  // column 9", which only holds for the spaced variant asserted next; the caret
  // must line up with the offending comma either way.)
  assert.equal(input.indexOf(','), 7);
  assert.equal(result.error.column, 8);
  assert.match(result.error.caret, /^ *\^$/);
  assert.equal(result.error.caret, ' '.repeat(7) + '^');
  assert.equal(result.error.caret[input.indexOf(',')], '^');
});

test('parseJson column arithmetic tracks the offending offset (index 8 -> column 9)', () => {
  const input = '{"a": 1 ,}';
  const result = parseJson(input);

  assert.equal(result.error.code, 'TRAILING_COMMA');
  assert.equal(input.indexOf(','), 8);
  assert.equal(result.error.column, 9);
  assert.equal(result.error.caret, ' '.repeat(8) + '^');
  assert.equal(result.error.caret[input.indexOf(',')], '^');
});

test('parseJson locates an error that V8 reports without a position', () => {
  // V8 answers `Unexpected token ',', ...` with no location at all for this
  // input, so a correct line here proves our own parser produced the error.
  const result = parseJson('{\n  "a": 1,\n  "b": ,\n}');
  assert.equal(result.ok, false);
  assert.equal(result.error.line, 3);
});

test('parseJson classifies the mistakes developers paste', () => {
  const cases = [
    ["{'a': 1}", 'SINGLE_QUOTE'],
    ['{a: 1}', 'UNQUOTED_KEY'],
    ['{"a": 1} // trailing comment', 'COMMENT'],
    ['{"a": 1 /* c */}', 'COMMENT'],
    ['{"a": \u201cx\u201d}', 'SMART_QUOTE'],
    ['{"a": "x}', 'UNTERMINATED_STRING'],
    ['[1,2', 'UNEXPECTED_EOF'],
  ];

  for (const [input, code] of cases) {
    const result = parseJson(input);
    assert.equal(result.ok, false, `expected ${JSON.stringify(input)} to fail`);
    assert.equal(result.error.code, code, `wrong code for ${JSON.stringify(input)}`);
  }
});

test('parseJson marks the recoverable mistakes as repairable', () => {
  const cases = [
    ["{'a': 1}", 'SINGLE_QUOTE'],
    ['{a: 1}', 'UNQUOTED_KEY'],
    ['{"a": 1} // trailing comment', 'COMMENT'],
  ];

  for (const [input, code] of cases) {
    const result = parseJson(input);
    assert.equal(result.error.code, code);
    assert.equal(result.error.repairable, true, `expected ${JSON.stringify(input)} to be repairable`);
  }
});

test('parseJson never throws', () => {
  for (const input of ALL_INPUTS) {
    assert.doesNotThrow(() => parseJson(input), `threw on ${JSON.stringify(input)}`);
  }
  assert.doesNotThrow(() => parseJson(undefined));
  assert.doesNotThrow(() => parseJson(null));
  assert.doesNotThrow(() => parseJson(42));
});

test('repairJson rewrites relaxed JSON into valid, indented JSON', () => {
  const result = repairJson('{a: 1,}');
  assert.equal(result.ok, true);
  assert.equal(result.text, '{\n  "a": 1\n}');
});

test('repairJson handles nested trailing commas and single quotes', () => {
  const result = repairJson("{'a': [1,2,],}");
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.text), { a: [1, 2] });
});

test('repairJson refuses input it cannot recover', () => {
  const result = repairJson('[1,2');
  assert.equal(result.ok, false);
});

test('parseDocuments auto-detects NDJSON', () => {
  const result = parseDocuments('{"a":1}\n{"b":2}\n', { mode: 'auto' });
  assert.equal(result.ok, true);
  assert.equal(result.docs.length, 2);
  assert.equal(result.format, 'ndjson');
});

test('parseDocuments auto-detects a single JSON document', () => {
  const result = parseDocuments('[1,2]', { mode: 'auto' });
  assert.equal(result.ok, true);
  assert.equal(result.format, 'json');
  assert.equal(result.docs.length, 1);
});

test('parseDocuments rejects relaxed syntax in strict json mode', () => {
  const result = parseDocuments('{"a":1}\n{b:2}', { mode: 'json' });
  assert.equal(result.ok, false);
});

test('parseDocuments reports the real line number of a broken NDJSON line', () => {
  const text = '{"a":1}\n{"b":,}\n{"c":3}\n';
  const result = parseDocuments(text, { mode: 'ndjson' });

  assert.equal(result.ok, false);
  assert.equal(result.error.line, 2);
});

test('locate turns a character offset into line, column, snippet and caret', () => {
  const location = locate('a\nbc', 2);
  assert.equal(location.line, 2);
  assert.equal(location.column, 1);
  assert.equal(location.snippet, 'bc');
  assert.equal(location.caret, '^');
});
