/**
 * Regression tests for src/core/keypath.js.
 *
 * One field, rendered in every notation the UI offers. The two parallel segment
 * arrays exist precisely so `list[0].name`, `list[].name` and `list.name` can
 * all come out of the same field without guessing which segment is an index.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPath } from '../src/core/keypath.js';

// A field two levels inside an array: `{ user: [{ name: ... }] }`.
const SEGMENTS = ['user', '[]', 'name'];
const REAL_SEGMENTS = ['user', '0', 'name'];

const normalised = (style) => formatPath(SEGMENTS, REAL_SEGMENTS, { style });
const withRealIndices = (style) => formatPath(SEGMENTS, REAL_SEGMENTS, { style, realIndices: true });

test('dotBracket renders array elements as [] or as the real index', () => {
  assert.equal(normalised('dotBracket'), 'user[].name');
  assert.equal(withRealIndices('dotBracket'), 'user[0].name');
});

test('dot drops array elements entirely', () => {
  assert.equal(normalised('dot'), 'user.name');
});

test('bracket renders the first segment bare and the rest bracketed', () => {
  assert.equal(normalised('bracket'), 'user[]["name"]');
  assert.equal(withRealIndices('bracket'), 'user[0]["name"]');
});

test('jsonpath renders as $.user[*].name or $.user[0].name', () => {
  assert.equal(normalised('jsonpath'), '$.user[*].name');
  assert.equal(withRealIndices('jsonpath'), '$.user[0].name');
});

test('jq renders as .user[].name or .user[0].name', () => {
  assert.equal(normalised('jq'), '.user[].name');
  assert.equal(withRealIndices('jq'), '.user[0].name');
});

test('pointer uses real indices', () => {
  assert.equal(withRealIndices('pointer'), '/user/0/name');
});

test('column joins snake_cased segments', () => {
  assert.equal(normalised('column'), 'user_name');
});

test('JSON Pointer escapes ~ as ~0 and / as ~1', () => {
  const path = formatPath(['a/b~c'], ['a/b~c'], { style: 'pointer', realIndices: true });
  assert.equal(path, '/a~1b~0c');
  assert.ok(path.includes('a~1b~0c'));
});
