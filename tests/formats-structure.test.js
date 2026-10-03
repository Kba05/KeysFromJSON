/**
 * Structural tests for the declaration generators.
 *
 * These are about *shape*, not just "it returned something": exactly one
 * declaration per distinct nested type, indentation that grows with nesting, and
 * optionality/nullability mapped onto the right syntax. The duplicate-declaration
 * and flat-indentation bugs this file locks down were both invisible to a
 * "did it throw" check.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractAll } from '../src/core/extract.js';
import { buildSchema } from '../src/core/schema.js';
import { buildKeyItems } from '../src/core/decorate.js';
import { renderFormat } from '../src/formats/index.js';

function context(docs, overrides = {}) {
  const fields = extractAll(docs);
  const options = {
    indent: 2,
    typeName: 'Order',
    wrap: { left: '"', right: '"' },
    caseMode: 'none',
    pathStyle: 'dotBracket',
    separator: 'comma-newline',
    ...overrides,
  };
  const { items, stats } = buildKeyItems(fields, options);
  return { fields, items, stats, docs, schema: buildSchema(docs), options };
}

const ORDER = {
  id: 1,
  user: { name: 'Ada', address: { city: 'London' } },
  items: [
    { sku: 'A-1', qty: 1 },
    { sku: 'B-2', qty: 2, discount: 0.1 },
  ],
  note: null,
  mixed: [1, 'two'],
};

const declarationNames = (text) =>
  [...text.matchAll(/^(?:export\s+)?(?:type|interface)\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]);

test('TypeScript emits exactly one declaration per nested type', () => {
  const names = declarationNames(renderFormat('ts-type', context([ORDER])).text);

  assert.deepEqual(names.sort(), ['Order', 'OrderItemsItem', 'OrderUser', 'OrderUserAddress']);
  assert.equal(new Set(names).size, names.length, 'no declaration name is reused');
});

test('TypeScript keeps optional and nullable apart', () => {
  const text = renderFormat('ts-type', context([ORDER])).text;

  assert.match(text, /discount\?: number;/, 'a key missing from one array element is optional');
  assert.match(text, /note: null;/, 'a literal null value becomes the null type');
  assert.match(text, /mixed: \(string \| number\)\[\];/, 'a union element type is parenthesised before []');
});

test('TypeScript inline mode declares nothing but the root', () => {
  const text = renderFormat('ts-inline', context([ORDER])).text;

  assert.equal(declarationNames(text).length, 1);
  assert.match(text, /user: \{ name: string; address: \{ city: string \} \};/);
});

test('Zod output is indented relative to its nesting depth', () => {
  const text = renderFormat('zod-schema', context([ORDER])).text;
  const lines = text.split('\n');

  // The root property block sits at two spaces, its nested object at four, and
  // the object inside that at six.
  const idLine = lines.find((line) => line.includes('id: z.number()'));
  const nameLine = lines.find((line) => line.includes('name: z.string()'));
  const cityLine = lines.find((line) => line.includes('city: z.string()'));

  const indentOf = (line) => line.length - line.trimStart().length;
  assert.equal(indentOf(idLine), 2);
  assert.equal(indentOf(nameLine), 4);
  assert.equal(indentOf(cityLine), 6, 'nested objects must indent one more level each time');
});

test('Zod output closes every brace it opens and has no stray whitespace', () => {
  const text = renderFormat('zod-schema', context([ORDER])).text;

  assert.equal((text.match(/z\.object\(\{/g) ?? []).length, (text.match(/\}\)/g) ?? []).length);
  assert.doesNotMatch(text, /(\s\s\{|\(\s+\{)/, 'no double space before an opening brace');
  for (const line of text.split('\n')) {
    assert.equal(line, line.replace(/[ \t]+$/, ''), `trailing whitespace in: ${line}`);
  }
});

test('Zod maps optional and nullable onto chained calls', () => {
  const text = renderFormat('zod-schema', context([ORDER])).text;

  assert.match(text, /discount: z\.number\(\)\.optional\(\),/);
  assert.match(text, /note: z\.null\(\),/);
  assert.match(text, /mixed: z\.array\(z\.union\(\[z\.string\(\), z\.number\(\)\]\)\),/);
});

test('an explicitly nullable field gets .nullable()', () => {
  const text = renderFormat('zod-schema', context([{ a: null }, { a: 'x' }])).text;

  assert.match(text, /a: z\.string\(\)\.nullable\(\),/);
});

test('JSON Schema lists required and optional keys', () => {
  const schema = JSON.parse(renderFormat('json-schema', context([ORDER])).text);

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.title, 'Order');
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['id', 'user', 'items', 'note', 'mixed']);
  assert.equal(schema.properties.items.type, 'array');
  assert.deepEqual(schema.properties.items.items.required, ['sku', 'qty']);
});

test('the JSON skeleton mirrors the input shape without sharing it', () => {
  const skeleton = JSON.parse(renderFormat('json-skeleton', context([ORDER])).text);

  assert.equal(skeleton.id, null);
  assert.deepEqual(Object.keys(skeleton.user), ['name', 'address']);
  assert.equal(skeleton.items.length, 1);
  assert.deepEqual(Object.keys(skeleton.items[0]), ['sku', 'qty', 'discount']);
  assert.deepEqual(skeleton.mixed, [null]);
});

test('the JSON skeleton can use typed placeholders', () => {
  const skeleton = JSON.parse(
    renderFormat('json-skeleton', context([ORDER], { jsonSkeletonTyped: true })).text,
  );

  assert.equal(skeleton.id, 0);
  assert.equal(skeleton.user.name, '');
});

test('column formats default to leaf keys', () => {
  const ctx = context([ORDER]);
  const header = renderFormat('csv-header', ctx).text;

  assert.ok(header.includes('city'), 'leaf keys are present');
  assert.ok(!header.includes('user,') && !header.startsWith('id,user,'), 'container keys are not columns');
  assert.ok(header.split(',').every((cell) => !['user', 'items', 'address'].includes(cell)));

  // Opting back in restores the full key list.
  const all = renderFormat('csv-header', { ...ctx, options: { ...ctx.options, columnsLeavesOnly: false } }).text;
  assert.ok(all.includes('user'));
});

test('nullability survives a merge across documents', () => {
  const text = renderFormat('ts-type', context([{ a: 1 }, { a: null }])).text;

  assert.match(text, /a: number \| null;/);
});
