/**
 * Regression tests for src/core/schema.js.
 *
 * The schema tree is what the type and SQL generators read, so what matters is
 * that ambiguous values become unions instead of guesses, and that repeated
 * array elements merge into one object type where the keys present in every
 * element come out required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arrayElement,
  buildSchema,
  hasArray,
  isNullable,
  isUnknown,
  objectFields,
  primitiveTypes,
  schemaOf,
  sqlTypeOf,
  typeLabel,
  withoutNull,
} from '../src/core/schema.js';

const fieldByName = (fields, name) => fields.find((field) => field.name === name);

/**
 * The node for `name` in the merged schema of `docs`.
 *
 * `buildSchema` returns an object node, so a missing field means the root node
 * is not an object at all — worth saying out loud rather than failing with a
 * bare TypeError.
 */
function fieldNode(docs, name) {
  const root = buildSchema(docs);
  const field = fieldByName(objectFields(root), name);
  assert.ok(
    field,
    `buildSchema(${JSON.stringify(docs)}) produced no field "${name}" (root node kind: "${root.kind}")`,
  );
  return field.node;
}

test('keys present in every document are required, the rest optional', () => {
  const root = buildSchema([{ a: 1 }, { a: 2, b: 3 }]);
  const fields = objectFields(root);

  assert.ok(
    fields.length > 0,
    `objectFields(buildSchema([{a:1},{a:2,b:3}])) is empty (root node kind: "${root.kind}")`,
  );
  assert.equal(fieldByName(fields, 'a').optional, false);
  assert.equal(fieldByName(fields, 'b').optional, true);
});

test('a value that is null in one document is nullable', () => {
  const node = fieldNode([{ a: null }, { a: 'x' }], 'a');

  assert.equal(isNullable(node), true);
  assert.deepEqual(primitiveTypes(withoutNull(node)), ['string']);
});

test('differing primitives merge into a union', () => {
  const node = fieldNode([{ a: 1 }, { a: 'x' }], 'a');

  assert.deepEqual(primitiveTypes(node), ['string', 'number']);
});

test('array elements merge into one object shape', () => {
  const node = fieldNode([{ items: [{ x: 1 }] }, { items: [{ x: 2, y: 3 }] }], 'items');

  assert.equal(hasArray(node), true);

  const fields = objectFields(arrayElement(node));
  assert.ok(
    fields.length > 0,
    `arrayElement(...) has no object fields (node kind: "${node.kind}")`,
  );
  assert.equal(fieldByName(fields, 'x').optional, false);
  assert.equal(fieldByName(fields, 'y').optional, true);
});

test('an array with no elements has an unknown element schema', () => {
  const node = fieldNode([{ a: [] }], 'a');

  assert.equal(isUnknown(arrayElement(node)), true);
});

test('an object with no keys is an empty object, not null', () => {
  const node = fieldNode([{ a: {} }], 'a');

  assert.deepEqual(objectFields(node), []);
  assert.equal(isNullable(node), false);
});

test('schemaOf records string samples for length', () => {
  const single = schemaOf('x');
  assert.equal(single.kind, 'primitive');
  assert.equal(single.type, 'string');
  assert.equal(single.maxLength, 1);

  assert.equal(schemaOf('abcd').maxLength, 4);
});

test('typeLabel names every alternative', () => {
  const label = typeLabel(fieldNode([{ a: null }, { a: 1 }], 'a'));

  assert.ok(label.includes('number'), `expected "number" in "${label}"`);
  assert.ok(label.includes('null'), `expected "null" in "${label}"`);
});

test('sqlTypeOf maps primitive nodes onto neutral SQL column types', () => {
  assert.equal(sqlTypeOf(schemaOf('x')), 'TEXT');
  assert.equal(sqlTypeOf(schemaOf(1)), 'NUMERIC');
  assert.equal(sqlTypeOf(schemaOf(true)), 'BOOLEAN');
});

test('sqlTypeOf maps an object node to JSON', () => {
  assert.equal(sqlTypeOf(schemaOf({ a: 1 })), 'JSON');
});

test('sqlTypeOf maps an array node to JSON', () => {
  assert.equal(sqlTypeOf(schemaOf([1])), 'JSON');
});
