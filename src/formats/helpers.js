/**
 * Shared helpers for output formatters.
 *
 * A formatter is a plain object: `{ id, label, group, hint, run(ctx) }`. It gets
 * everything it needs in `ctx` and returns a string. Keeping them pure and
 * side-effect free is what makes them testable without a browser.
 *
 * `ctx` contains:
 *   fields   — every extracted key record (`src/core/extract.js`)
 *   items    — prepared, filtered and ordered name items (`src/core/decorate.js`)
 *   stats    — counts for the current run
 *   docs     — the parsed document(s)
 *   schema   — merged schema node for all documents (`src/core/schema.js`)
 *   options  — the whole app option object
 */

import { NodeKind, alternatives, hasArray, hasObject, isUnknown } from '../core/schema.js';

/** Indent every line of `text` except the first. */
export function indentLines(text, indent) {
  const pad = typeof indent === 'number' ? ' '.repeat(indent) : indent;
  return String(text)
    .split('\n')
    .map((line, index) => (index === 0 || line === '' ? line : `${pad}${line}`))
    .join('\n');
}

/** Indent every line, including the first. */
export function indentAll(text, indent) {
  const pad = typeof indent === 'number' ? ' '.repeat(indent) : indent;
  return String(text)
    .split('\n')
    .map((line) => (line === '' ? line : `${pad}${line}`))
    .join('\n');
}

/** Join blocks with a blank line between them, dropping empties. */
export function joinBlocks(blocks, separator = '\n\n') {
  return blocks.filter((block) => block && block.length > 0).join(separator);
}

/** Normalise the indent option to a real string. */
export function indentUnit(options = {}) {
  const value = options.indent ?? 2;
  return value === 'tab' ? '\t' : ' '.repeat(Number(value) || 0);
}

/** True when the node is unambiguously an object. */
export function isPlainObject(node) {
  const alts = alternatives(node);
  return alts.length === 1 && alts[0].kind === NodeKind.OBJECT;
}

/** True when the node is unambiguously an array. */
export function isPlainArray(node) {
  const alts = alternatives(node);
  return alts.length === 1 && alts[0].kind === NodeKind.ARRAY;
}

/** True when the node holds more than one alternative. */
export function isUnion(node) {
  return alternatives(node).length > 1;
}

/** True when the node mixes objects or arrays with anything else. */
export function isMixedShape(node) {
  const alts = alternatives(node);
  return alts.length > 1 && (hasObject(node) || hasArray(node));
}

/** True when nothing is known about the node. */
export function isUnknownNode(node) {
  return isUnknown(node);
}

/** The literal `null` type, used by generators that need a fallback. */
export const NULL_LITERAL = 'null';

/**
 * Escape text for a single-line comment in most C-family languages.
 * Collapses newlines so a value can never break out of the comment.
 */
export function commentText(value, maxLength = 60) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** A short, readable sample of a primitive value, for generated comments. */
export function sampleOf(node) {
  for (const alt of alternatives(node)) {
    if (alt.kind === NodeKind.PRIMITIVE) {
      if (alt.type === 'string') return alt.maxLength ? `string(${alt.maxLength})` : 'string';
      return alt.type;
    }
  }
  return 'complex';
}
