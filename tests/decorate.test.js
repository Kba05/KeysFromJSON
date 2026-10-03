/**
 * Regression tests for src/core/decorate.js.
 *
 * This is the stage that replaces the hard-coded behaviour of the original
 * single-file tool. The headline defect it fixes is per-branch deduplication:
 * duplicates must be detected across the whole field list, not one recursion
 * branch at a time.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFields } from '../src/core/extract.js';
import { buildKeyItems, joinKeyItems } from '../src/core/decorate.js';

const names = (result) => result.items.map((item) => item.name);
const texts = (result) => result.items.map((item) => item.text);

test('dedupe is global, not per branch', () => {
  const fields = extractFields({ r: [{ x: 1, y: 2 }, { x: 3, z: 4 }] });
  const { items, stats } = buildKeyItems(fields);

  assert.equal(items.length, 4);
  assert.deepEqual(names({ items }), ['r', 'x', 'y', 'z']);
  assert.equal(stats.matched, 5);
  assert.equal(stats.unique, 4);
  assert.equal(stats.duplicates, 1);
});

test('joinKeyItems uses the named separators', () => {
  const { items } = buildKeyItems(extractFields({ r: [{ x: 1, y: 2 }, { x: 3, z: 4 }] }));

  assert.equal(joinKeyItems(items, 'comma-newline'), '"r",\n"x",\n"y",\n"z"');
  // The original tool's separator, kept for compatibility.
  assert.equal(joinKeyItems(items, 'comma-newline-lead'), '"r", \n"x", \n"y", \n"z"');
});

test('nodeFilter separates containers from leaves', () => {
  const fields = extractFields({ a: { b: 1 }, c: 2 });

  assert.deepEqual(names(buildKeyItems(fields, { nodeFilter: 'leaf' })), ['b', 'c']);
  assert.deepEqual(names(buildKeyItems(fields, { nodeFilter: 'container' })), ['a']);
});

test('include and exclude patterns filter on the key', () => {
  const fields = extractFields({ x: 1, y: 2 });

  assert.deepEqual(names(buildKeyItems(fields, { includePattern: '^x' })), ['x']);
  assert.deepEqual(names(buildKeyItems(fields, { excludePattern: '^x' })), ['y']);
});

test('a broken include pattern is reported, never thrown, and filters nothing', () => {
  const fields = extractFields({ x: 1, y: 2 });
  let result;

  assert.doesNotThrow(() => {
    result = buildKeyItems(fields, { includePattern: '(' });
  });

  assert.notEqual(result.errors.include, null);
  assert.equal(typeof result.errors.include, 'string');
  assert.deepEqual(names(result), ['x', 'y']);
});

test('selected keeps only the chosen field ids', () => {
  const fields = extractFields({ a: 1, b: 2 });
  const result = buildKeyItems(fields, { selected: new Set([0]) });

  assert.deepEqual(names(result), ['a']);
  assert.equal(result.stats.matched, 1);
});

test('search narrows the result case-insensitively', () => {
  const fields = extractFields({ x: 1, Y: 2 });

  assert.deepEqual(names(buildKeyItems(fields, { search: 'y' })), ['Y']);
});

test('nameSource path turns names into paths, and dedupeBy picks the bucket', () => {
  const fields = extractFields({ a: { id: 1 }, b: { id: 2 } });

  // Name de-duplication is the default — it is what makes a "unique key names"
  // list work at all — so the two `id` records collapse even when paths are
  // printed. `dedupeBy: 'path'` is what keeps every distinct path.
  assert.deepEqual(names(buildKeyItems(fields, { nameSource: 'path' })), ['a', 'a.id', 'b']);

  assert.deepEqual(names(buildKeyItems(fields, { nameSource: 'path', dedupeBy: 'path' })), [
    'a',
    'a.id',
    'b',
    'b.id',
  ]);

  const byName = buildKeyItems(fields, { nameSource: 'path', dedupeBy: 'name' });
  assert.equal(byName.items.length, 3);
  assert.equal(byName.items.filter((item) => item.name.endsWith('.id')).length, 1);

  const byPath = buildKeyItems(fields, { nameSource: 'path', dedupeBy: 'path' });
  assert.equal(byPath.items.length, 4);
  assert.equal(byPath.items.filter((item) => item.name.endsWith('.id')).length, 2);
});

test('sort orders by name or by depth', () => {
  const fields = extractFields({ m: { a: 1 } });

  assert.deepEqual(names(buildKeyItems(fields, { sort: 'alpha' })), ['a', 'm']);
  assert.deepEqual(names(buildKeyItems(fields, { sort: 'depth' })), ['m', 'a']);
});

test('caseMode with nameSource path converts every path segment', () => {
  const fields = extractFields({ myKey: { otherKey: 1 } });
  const result = buildKeyItems(fields, { nameSource: 'path', caseMode: 'snake' });

  assert.deepEqual(names(result), ['my_key', 'my_key.other_key']);
});

test('wrap wraps every entry', () => {
  const fields = extractFields({ a: 1, b: 2 });
  const result = buildKeyItems(fields, { wrap: { left: "'", right: "'" } });

  assert.deepEqual(texts(result), ["'a'", "'b'"]);
  assert.equal(joinKeyItems(result.items, 'comma-space'), "'a', 'b'");
});

test('stats stay consistent: unique + duplicates === matched', () => {
  const fields = extractFields({ r: [{ x: 1, y: 2 }, { x: 3, z: 4 }] });

  const optionSets = [
    {},
    { nodeFilter: 'leaf' },
    { search: 'x' },
    { nameSource: 'path' },
    { nameSource: 'path', dedupeBy: 'path' },
    { includePattern: '^[xy]' },
  ];

  for (const options of optionSets) {
    const { stats } = buildKeyItems(fields, options);
    assert.equal(
      stats.unique + stats.duplicates,
      stats.matched,
      `inconsistent stats for ${JSON.stringify(options)}`,
    );
    assert.equal(stats.scanned, fields.length);
  }
});
