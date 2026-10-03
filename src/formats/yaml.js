/**
 * YAML and dotenv output.
 *
 * `yaml-keys` is the one formatter that keeps the document *shape*: every key in
 * its real nesting, with `null` where a value would go. It is a skeleton to fill
 * in, not a serialisation of the data, so unions collapse to the first shape that
 * can hold children and scalars become `null`.
 */

import { applyCase } from '../core/naming.js';
import {
  NodeKind,
  alternatives,
  isUnknown,
  objectFields,
  objectNode,
} from '../core/schema.js';
import { indentUnit } from './helpers.js';

/**
 * Keys that are safe unquoted: letters, digits, `_`, `-` and `.`, as long as the
 * first character is not a digit (which YAML may read as a number).
 */
const BARE_KEY = /^[A-Za-z_.-][A-Za-z0-9_.-]*$/;

/** Quote a key only when a plain scalar could be misread. */
function quoteKey(key) {
  const text = String(key);
  if (BARE_KEY.test(text)) return text;
  // Single quotes are the only YAML quoting style without escape sequences.
  return `'${text.replace(/'/g, "''")}'`;
}

function arrayAltOf(node) {
  return alternatives(node).find((alt) => alt.kind === NodeKind.ARRAY) ?? null;
}

/**
 * Lines for `key: <value>`.
 *
 * The object branch is checked first so a value that is an object in one document
 * and an array in another still reads as a mapping rather than as an empty list.
 */
function fieldLines(name, node, indent, state) {
  const key = `${indent}${quoteKey(name)}:`;

  const object = objectNode(node);
  if (object) {
    const fields = objectFields(object);
    if (fields.length === 0) return [`${key} {}`];
    const lines = [key];
    for (const field of fields) {
      lines.push(...fieldLines(field.name, field.node, indent + state.unit, state));
    }
    return lines;
  }

  const array = arrayAltOf(node);
  if (array) {
    // An unknown element is what an always-empty array looks like.
    if (isUnknown(array.element)) return [`${key} []`];
    // One entry is enough to show the item shape without repeating it per sample.
    return [key, ...itemLines(array.element, indent + state.unit, state)];
  }

  return [`${key} null`];
}

/** One list entry: `- null`, `- []`, `- {}` or an object block hanging off the dash. */
function itemLines(node, indent, state) {
  const child = indent + '  ';

  const object = objectNode(node);
  if (object) {
    const fields = objectFields(object);
    if (fields.length === 0) return [`${indent}- {}`];
    const block = fields.flatMap((field) => fieldLines(field.name, field.node, child, state));
    // The first key shares its line with the dash; the rest keep the alignment.
    block[0] = `${indent}- ${block[0].slice(child.length)}`;
    return block;
  }

  const array = arrayAltOf(node);
  if (array) {
    if (isUnknown(array.element)) return [`${indent}- []`];
    const block = itemLines(array.element, child, state);
    block[0] = `${indent}- ${block[0].slice(child.length)}`;
    return block;
  }

  return [`${indent}- null`];
}

function documentLines(schema, state) {
  const object = objectNode(schema);
  if (object) {
    const fields = objectFields(object);
    if (fields.length === 0) return ['{}'];
    return fields.flatMap((field) => fieldLines(field.name, field.node, '', state));
  }

  const array = arrayAltOf(schema);
  if (array) {
    if (isUnknown(array.element)) return ['[]'];
    return itemLines(array.element, '', state);
  }

  return ['null'];
}

function yamlKeys(ctx) {
  const state = { unit: indentUnit(ctx.options) };
  const lines = documentLines(ctx.schema, state);

  // The header is a convenience for pasting; callers can switch it off.
  if (ctx.options.yamlHeader === false) return lines.join('\n');
  return [`# Keys of ${ctx.options.typeName || 'Root'}`, ...lines].join('\n');
}

function dotenvLines(ctx) {
  const leavesOnly = ctx.options.dotenvLeavesOnly !== false;

  const lines = [];
  for (const item of ctx.items) {
    // A container is not an environment variable, so it is skipped by default.
    if (leavesOnly && item.field && !item.field.isLeaf) continue;
    lines.push(`${applyCase(item.name, 'constant')}=`);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Formatter entries
 * ------------------------------------------------------------------ */

export const yamlFormatters = [
  {
    id: 'yaml-keys',
    label: 'YAML keys',
    group: 'data',
    hint: 'A nested YAML skeleton with every key and a null placeholder',
    schema: true,
    run: (ctx) => yamlKeys(ctx),
  },
  {
    id: 'dotenv',
    label: 'dotenv lines',
    group: 'data',
    hint: 'KEY= placeholder lines from the selected keys',
    run: (ctx) => dotenvLines(ctx),
  },
];
