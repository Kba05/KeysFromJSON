/**
 * Regression tests for src/core/naming.js: word splitting, case conversion and
 * the identifier/quoting helpers the output generators lean on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCase,
  escapeDoubleQuoted,
  isValidIdentifier,
  quoteIfNeeded,
  splitWords,
  toTypeName,
  wrapKey,
} from '../src/core/naming.js';

test('applyCase converts to every advertised case', () => {
  assert.equal(applyCase('my_key', 'camel'), 'myKey');
  assert.equal(applyCase('my_key', 'pascal'), 'MyKey');
  assert.equal(applyCase('myKey', 'snake'), 'my_key');
  assert.equal(applyCase('my-key name', 'snake'), 'my_key_name');
  assert.equal(applyCase('Anything', 'none'), 'Anything');
  assert.equal(applyCase('myKey', 'constant'), 'MY_KEY');
  assert.equal(applyCase('myKey', 'kebab'), 'my-key');
  assert.equal(applyCase('', 'camel'), '');
});

test('applyCase keeps acronyms and trailing digits attached to their word', () => {
  assert.equal(applyCase('HTTPStatus', 'snake'), 'http_status');
  assert.equal(applyCase('field1Name', 'snake'), 'field1_name');
  assert.equal(applyCase('field1', 'snake'), 'field1');
});

test('splitWords handles acronym runs', () => {
  assert.deepEqual(splitWords('HTTPStatusCode'), ['http', 'status', 'code']);
  assert.deepEqual(splitWords('my-key name'), ['my', 'key', 'name']);
  assert.deepEqual(splitWords(''), []);
});

test('toTypeName always produces a usable type name', () => {
  assert.equal(toTypeName('user profile'), 'UserProfile');
  assert.match(toTypeName('123abc', 'Root'), /^[A-Za-z]/);
  assert.equal(toTypeName('', 'Root'), 'Root');
});

test('isValidIdentifier accepts only bare JS identifiers', () => {
  assert.equal(isValidIdentifier('a1'), true);
  assert.equal(isValidIdentifier('1a'), false);
  assert.equal(isValidIdentifier('a-b'), false);
});

test('escapeDoubleQuoted escapes quotes, backslashes and control characters', () => {
  const input = 'a"b\\c\nd';
  const escaped = escapeDoubleQuoted(input);

  // No raw quote, backslash or newline survives; round-tripping through
  // JSON.parse proves the escaping is complete and unambiguous.
  assert.equal(/[\n\r\t]/.test(escaped), false);
  assert.equal(escaped, 'a\\"b\\\\c\\nd');
  assert.equal(JSON.parse(`"${escaped}"`), input);
});

test('wrapKey wraps with the configured characters', () => {
  assert.equal(wrapKey('id', { left: '"', right: '"' }), '"id"');
  // A missing right side mirrors the left.
  assert.equal(wrapKey('id', { left: '[' }), '[id]');
});

test('quoteIfNeeded quotes only when the target syntax requires it', () => {
  assert.equal(quoteIfNeeded('id'), 'id');
  assert.equal(quoteIfNeeded('my-key'), '"my-key"');
});
