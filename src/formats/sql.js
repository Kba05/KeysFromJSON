/**
 * SQL output.
 *
 * Two shapes, because the two things people do with JSON keys in a database are
 * different: paste the key list into an existing query, or scaffold a table.
 *
 * Column types are inferred from the merged schema rather than from a single
 * sample, so a key that is a string in one document and a number in another
 * degrades to `TEXT` instead of picking one document's answer.
 */

import { applyCase, isValidBareName } from '../core/naming.js';
import {
  NodeKind,
  alternatives,
  hasArray,
  hasObject,
  isNullable,
  objectFields,
  primitiveTypes,
  sqlTypeOf,
  withoutNull,
} from '../core/schema.js';
import { indentUnit } from './helpers.js';

/**
 * Names that read as a date or a time. JSON has no date type, so the key is the
 * only hint available: `created_at`, `date`, `order_date`, `time`, `start_time`.
 */
const TIMESTAMP_NAME = /_at$|^date|_date$|^time|_time$/i;

/** The narrowest identifier quoting SQL accepts; bare when it is unambiguous. */
function quoteIdentifier(name) {
  const text = String(name);
  if (isValidBareName(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function tableName(options) {
  const text = String(options.tableName || 'Root').trim();
  return quoteIdentifier(text || 'Root');
}

/**
 * `VARCHAR(n)` sized from the longest sample seen, or `TEXT` when no sample was
 * long enough to be worth narrowing.
 */
function varcharType(node) {
  let longest = 0;
  for (const alt of alternatives(node)) {
    if (alt.kind === NodeKind.PRIMITIVE && alt.type === 'string') {
      longest = Math.max(longest, alt.maxLength ?? 0);
    }
  }
  if (longest <= 0) return 'TEXT';

  // Round up to the next multiple of 16 so the column has room to grow, never
  // below 32 for a column that is obviously a real string, and never above 4000
  // because that is the widest VARCHAR engines index comfortably.
  const size = Math.min(4000, Math.max(32, Math.ceil(longest / 16) * 16));
  return `VARCHAR(${size})`;
}

/** The SQL type for one column, preferring a name hint over the inferred type. */
function columnType(name, node) {
  // Containers survive only as JSON; no scalar column can hold them.
  if (hasObject(node) || hasArray(node)) return 'JSON';

  const types = primitiveTypes(withoutNull(node));
  if (types.length === 1 && types[0] === 'string') {
    return TIMESTAMP_NAME.test(name) ? 'TIMESTAMP' : varcharType(node);
  }
  return sqlTypeOf(node);
}

/**
 * The fields the table is built from.
 *
 * A root-level array is a list of records (see `extract.js`), so its element
 * object describes the table instead of leaving the statement empty.
 */
function tableFields(schema) {
  const fields = objectFields(schema);
  if (fields.length > 0) return fields;
  const array = alternatives(schema).find((alt) => alt.kind === NodeKind.ARRAY);
  return array ? objectFields(array.element) : [];
}

function createTable(ctx) {
  const unit = indentUnit(ctx.options);
  const fields = tableFields(ctx.schema);

  const columns = fields.map((field) => {
    const type = columnType(field.name, field.node);
    // A column called exactly `id` is the one primary key we can read off the
    // data; none is invented when the document has no such key.
    const constraint = field.name === 'id'
      ? ' PRIMARY KEY'
      : !field.optional && !isNullable(field.node) ? ' NOT NULL' : '';
    return `${unit}${quoteIdentifier(field.name)} ${type}${constraint}`;
  });

  const head = `CREATE TABLE ${tableName(ctx.options)} (`;
  if (columns.length === 0) return `${head}\n);`;
  return `${head}\n${columns.join(',\n')}\n);`;
}

function columnList(ctx) {
  const leavesOnly = ctx.options.sqlLeavesOnly !== false;
  const snakeCase = ctx.options.sqlSnakeCase !== false;

  const names = [];
  for (const item of ctx.items) {
    // A container is not a column, so it only survives when the caller opts in.
    if (leavesOnly && item.field && !item.field.isLeaf) continue;
    names.push(snakeCase ? applyCase(item.name, 'snake') : item.name);
  }
  return names.join(',\n');
}

/* ------------------------------------------------------------------ *
 * Formatter entries
 * ------------------------------------------------------------------ */

export const sqlFormatters = [
  {
    id: 'sql-columns',
    label: 'SQL column list',
    group: 'sql',
    hint: 'Comma-separated column names from the selected keys',
    run: (ctx) => columnList(ctx),
  },
  {
    id: 'sql-create-table',
    label: 'CREATE TABLE',
    group: 'sql',
    hint: 'A CREATE TABLE statement with inferred column types',
    schema: true,
    run: (ctx) => createTable(ctx),
  },
];
