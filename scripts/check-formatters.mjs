/**
 * Registry smoke check.
 *
 * Runs every formatter over a document chosen to be awkward — an array of objects
 * whose keys disagree, primitives and strings in arrays, nulls, empty containers,
 * deeply nested objects — and then over a document with mixed primitive types.
 *
 * This catches what unit tests do not: a format that throws or returns nothing for
 * input shape nobody wrote a test for yet, and any registration mistake in
 * `src/formats/index.js`.
 *
 * Run with `npm run check:formats`.
 */

import { FORMATTERS, renderFormat } from '../src/formats/index.js';
import { extractAll } from '../src/core/extract.js';
import { buildSchema } from '../src/core/schema.js';
import { buildKeyItems } from '../src/core/decorate.js';
import { DEFAULT_OPTIONS, toEngineOptions } from '../src/ui/state.js';

const AWKWARD = {
  id: 1,
  name: 'Ada',
  active: true,
  score: null,
  tags: ['a', 'b'],
  numbers: [1, 2, 3],
  empty_object: {},
  empty_array: [],
  nested_arrays: [[{ deep: 1 }]],
  items: [
    { sku: 'A-1', qty: 1 },
    { sku: 'B-2', qty: 2, discount: 0.1 },
  ],
  nested: { deep: { deeper: { value: 42 } } },
};

const MIXED = { records: [{ a: 1 }, { a: 'x', b: null }], empty: [], blank: {} };

/** Build the same context the UI passes to a formatter. */
function context(docs, overrides = {}) {
  const fields = extractAll(docs);
  const options = toEngineOptions({ ...DEFAULT_OPTIONS, ...overrides }, null);
  const { items, stats } = buildKeyItems(fields, options);
  return { fields, items, stats, docs, schema: buildSchema(docs), options };
}

const failures = [];
const lines = [];

const primary = context([AWKWARD], { typeName: 'Sample' });
const secondary = context([MIXED], { typeName: 'Mixed' });

for (const formatter of FORMATTERS) {
  for (const [label, ctx] of [
    ['awkward', primary],
    ['mixed types', secondary],
  ]) {
    const result = renderFormat(formatter.id, ctx);
    if (result.error) {
      failures.push(`${formatter.id} (${label}): ${result.error}`);
      continue;
    }
    if (typeof result.text !== 'string' || result.text.trim().length === 0) {
      failures.push(`${formatter.id} (${label}): produced no output`);
      continue;
    }
    if (label === 'awkward') {
      lines.push(`  ok  ${formatter.id.padEnd(20)} ${String(result.text.length).padStart(5)} chars`);
    }
  }
}

// Duplicate top-level declarations would mean a generator names the same nested
// type twice, which is exactly the bug an eager inline pass once caused.
const declarationNames = (text) =>
  [...text.matchAll(/^(?:export\s+)?(?:type|interface|public\s+class|data\s+class|record|type)\s+([A-Za-z0-9_]+)/gm)].map(
    (match) => match[1],
  );

for (const id of ['ts-type', 'ts-interface', 'csharp-class']) {
  const names = declarationNames(renderFormat(id, primary).text);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) failures.push(`${id}: duplicate declarations ${[...new Set(duplicates)].join(', ')}`);
}

console.log(lines.join('\n'));
console.log(`\n${FORMATTERS.length} formatters × 2 documents`);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('all formatters produced output for every document shape');
}
