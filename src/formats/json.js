/**
 * JSON-shaped outputs derived from the schema tree.
 *
 * `json-skeleton` is the fastest way to get a fill-in template out of a sample
 * payload; `json-schema` turns the same sample into a draft 2020-12 schema for
 * API validation.
 */

import { stringifyJson } from '../core/json-parse.js';
import {
  alternatives,
  isNullable,
  isUnknown,
  NodeKind,
  objectFields,
  withoutNull,
} from '../core/schema.js';
import { toTypeName } from '../core/naming.js';

/**
 * Build a sample value that mirrors the shape of a node.
 *
 * @param {object} node
 * @param {{typed?: boolean}} [options] `typed` fills primitives with a
 *        type-shaped placeholder ('' / 0 / false) instead of `null`.
 */
export function skeletonOf(node, options = {}) {
  const alts = alternatives(node);
  if (alts.length > 1) {
    // Prefer a concrete alternative so the template shows a usable shape. Strip
    // `null` only when there really is one: rebuilding `withoutNull` on a union
    // that has no `null` alternative reproduces the same union and never
    // terminates — which is what `string | number` used to do.
    const hasNull = alts.some((alt) => alt.kind === NodeKind.PRIMITIVE && alt.type === 'null');
    return skeletonOf(hasNull ? withoutNull(node) : alts[0], options);
  }

  const only = alts[0];
  switch (only.kind) {
    case NodeKind.PRIMITIVE:
      if (!options.typed) return null;
      switch (only.type) {
        case 'string':
          return '';
        case 'number':
          return 0;
        case 'boolean':
          return false;
        default:
          return null;
      }
    case NodeKind.OBJECT: {
      const result = {};
      for (const field of objectFields(only)) result[field.name] = skeletonOf(field.node, options);
      return result;
    }
    case NodeKind.ARRAY:
      return isUnknown(only.element) ? [] : [skeletonOf(only.element, options)];
    default:
      return null;
  }
}

/** Convert a schema node into a JSON Schema (draft 2020-12) fragment. */
export function jsonSchemaOf(node) {
  const alts = alternatives(node);
  const rendered = alts.map(singleSchema);
  if (rendered.length === 1) return rendered[0];
  // Several `type` values can stay in one keyword; mixed shapes need `anyOf`.
  const primitiveOnly = rendered.every((part) => typeof part.type === 'string');
  if (primitiveOnly) {
    return { type: rendered.map((part) => part.type) };
  }
  return { anyOf: rendered };
}

function singleSchema(node) {
  switch (node.kind) {
    case NodeKind.PRIMITIVE: {
      if (node.type === 'null') return { type: 'null' };
      const schema = { type: node.type === 'number' ? 'number' : node.type };
      if (node.type === 'string' && node.maxLength) schema.maxLength = node.maxLength;
      return schema;
    }
    case NodeKind.OBJECT: {
      const properties = {};
      const required = [];
      for (const field of objectFields(node)) {
        properties[field.name] = jsonSchemaOf(field.node);
        if (!field.optional) required.push(field.name);
      }
      const schema = { type: 'object', properties, additionalProperties: true };
      if (required.length > 0) schema.required = required;
      return schema;
    }
    case NodeKind.ARRAY:
      return isUnknown(node.element) ? { type: 'array' } : { type: 'array', items: jsonSchemaOf(node.element) };
    default:
      return {};
  }
}

export const jsonFormatters = [
  {
    id: 'json-skeleton',
    label: 'JSON skeleton',
    group: 'data',
    hint: 'The same nesting with null (or typed) placeholders, ready to fill in',
    schema: true,
    run: (ctx) =>
      stringifyJson(skeletonOf(ctx.schema, { typed: ctx.options.jsonSkeletonTyped === true }), ctx.options.indent ?? 2),
  },
  {
    id: 'json-schema',
    label: 'JSON Schema',
    group: 'data',
    hint: 'Draft 2020-12 schema with required fields and inferred types',
    schema: true,
    run: (ctx) => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: toTypeName(ctx.options.typeName || 'Root', 'Root'),
        ...jsonSchemaOf(ctx.schema),
      };
      return stringifyJson(schema, ctx.options.indent ?? 2);
    },
  },
  {
    id: 'json-required',
    label: 'Required / optional split',
    group: 'data',
    hint: 'Which keys always appear and which showed up only sometimes',
    schema: true,
    run: (ctx) => {
      const required = [];
      const optional = [];
      const collect = (node, prefix) => {
        for (const field of objectFields(node)) {
          const path = prefix ? `${prefix}.${field.name}` : field.name;
          if (field.optional) optional.push(path);
          else required.push(path);
          if (field.node.kind === NodeKind.OBJECT) collect(field.node, path);
          else if (field.node.kind === NodeKind.ARRAY) collect(field.node.element, `${path}[]`);
        }
      };
      collect(ctx.schema, '');
      return [
        `# Always present (${required.length})`,
        ...required,
        '',
        `# Sometimes missing (${optional.length})`,
        ...optional,
      ].join('\n');
    },
  },
];

/** Re-exported so the zod generator can share the null handling. */
export { isNullable };
