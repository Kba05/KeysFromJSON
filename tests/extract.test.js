/**
 * Regression tests for src/core/extract.js.
 *
 * The three defects this file exists to prevent:
 *  1. string indices (`"0"`, `"1"`) leaking in as keys because the old code
 *     used `for...in` over arrays and strings;
 *  2. a stray empty-string key, which is what produced a leading `, ` in the
 *     copied output;
 *  3. children being emitted before their parents (the old recursion joined
 *     strings on the way down).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countDistinctKeys,
  extractAll,
  extractFields,
  isContainer,
  maxDepthOf,
  valueTypeOf,
} from '../src/core/extract.js';

const keys = (doc, options) => extractFields(doc, options).map((field) => field.key);

test('array string items do not leak their indices as keys', () => {
  assert.deepEqual(keys({ tags: ['a', 'b'] }), ['tags']);
});

test('primitive array items do not produce an empty key', () => {
  const fields = extractFields({ arr: [1, 2] });
  assert.deepEqual(fields.map((field) => field.key), ['arr']);
  assert.equal(fields.some((field) => field.key === ''), false);
});

test('records come out parent-first, in document order, across array elements', () => {
  assert.deepEqual(keys({ r: [{ x: 1, y: 2 }, { x: 3, z: 4 }] }), ['r', 'x', 'y', 'x', 'z']);
});

test('nested objects are walked depth-first', () => {
  assert.deepEqual(keys({ a: { b: 1 } }), ['a', 'b']);
});

test('null, object and array values are typed and leaf-flagged correctly', () => {
  const fields = extractFields({ a: null, b: {}, c: [] });
  const byKey = Object.fromEntries(fields.map((field) => [field.key, field]));

  assert.equal(byKey.a.isLeaf, true);
  assert.equal(byKey.a.valueType, 'null');

  assert.equal(byKey.b.isLeaf, false);
  assert.equal(byKey.b.valueType, 'object');

  assert.equal(byKey.c.isLeaf, false);
  assert.equal(byKey.c.valueType, 'array');
});

test('array elements keep both a normalised and a real path', () => {
  const fields = extractFields({ list: [{ a: 1 }] });
  const field = fields.find((entry) => entry.key === 'a');

  assert.deepEqual(field.segments, ['list', '[]', 'a']);
  assert.deepEqual(field.realSegments, ['list', '0', 'a']);
  assert.equal(field.arrayIndex, 0);
});

test('a root-level array is a list of records and adds no leading marker', () => {
  const fields = extractFields([{ a: 1 }]);
  const field = fields.find((entry) => entry.key === 'a');

  assert.deepEqual(field.segments, ['a']);
  assert.deepEqual(field.realSegments, ['a']);
  assert.equal(field.arrayIndex, 0);
});

test('maxDepth counts key nesting', () => {
  assert.deepEqual(keys({ a: { b: { c: 1 } } }, { maxDepth: 1 }), ['a', 'b']);
  assert.deepEqual(keys({ a: { b: { c: 1 } } }, { maxDepth: 0 }), ['a']);
});

test('non-containers yield no fields at all', () => {
  assert.deepEqual(extractFields(42), []);
  assert.deepEqual(extractFields(null), []);
  assert.deepEqual(extractFields('text'), []);
});

test('extractAll keeps documents apart with docIndex and sequential ids', () => {
  const fields = extractAll([{ a: 1 }, { b: 2 }]);

  assert.equal(fields.length, 2);
  assert.equal(fields[0].docIndex, 0);
  assert.equal(fields[1].docIndex, 1);
  assert.equal(fields[0].id, 0);
  assert.equal(fields[1].id, 1);
});

test('countDistinctKeys and maxDepthOf report what their names say', () => {
  const fields = extractFields({ a: { b: 1 }, c: 2 });
  assert.deepEqual(fields.map((field) => field.key), ['a', 'b', 'c']);
  assert.equal(countDistinctKeys(fields), 3);
  assert.equal(maxDepthOf(fields), 1);

  // duplicates collapse to one distinct key
  assert.equal(countDistinctKeys(extractFields({ r: [{ x: 1 }, { x: 2 }] })), 2);
  assert.equal(maxDepthOf([]), 0);
});

test('valueTypeOf and isContainer agree on the JSON types', () => {
  assert.equal(valueTypeOf(null), 'null');
  assert.equal(valueTypeOf([]), 'array');
  assert.equal(valueTypeOf({}), 'object');
  assert.equal(valueTypeOf('x'), 'string');
  assert.equal(valueTypeOf(1), 'number');
  assert.equal(valueTypeOf(true), 'boolean');

  assert.equal(isContainer({}), true);
  assert.equal(isContainer([]), true);
  assert.equal(isContainer(null), false);
  assert.equal(isContainer('x'), false);
  assert.equal(isContainer(1), false);
});
