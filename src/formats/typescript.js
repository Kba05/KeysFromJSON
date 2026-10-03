/**
 * TypeScript output.
 *
 * Three shapes are supported, because teams differ:
 *   - `type` alias with inline nested objects;
 *   - `interface` declarations with nested objects extracted into named types;
 *   - a flat list of the primitive leaves, for when only the fields matter.
 *
 * Nullable and optional are kept apart: a key that is missing in some array
 * elements becomes `?`, a key whose value can be `null` gets `| null`.
 */

import { CaseMode, toTypeName, quoteIfNeeded } from '../core/naming.js';
import {
  NodeKind,
  alternatives,
  arrayElement,
  isUnknown,
  objectFields,
} from '../core/schema.js';
import { indentUnit } from './helpers.js';

const TS_PRIMITIVE = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  null: 'null',
};

/**
 * Collects the named object types discovered while walking the schema.
 * Names are derived from the key path that produced them and de-duplicated with
 * a numeric suffix, so two different `items` objects stay distinct.
 */
class TypeRegistry {
  constructor() {
    this.byName = new Map(); // name -> declaration body
    this.usedNames = new Set();
  }

  claim(preferred) {
    let name = preferred;
    let counter = 2;
    while (this.usedNames.has(name)) {
      name = `${preferred}${counter}`;
      counter += 1;
    }
    this.usedNames.add(name);
    return name;
  }

  declare(name, body) {
    this.byName.set(name, body);
  }

  render(indent) {
    const blocks = [];
    for (const [name, declaration] of this.byName) {
      blocks.push(declaration(name, indent));
    }
    return blocks;
  }
}

function typeNameFromPath(segments, fallback) {
  const cleaned = segments.filter(Boolean);
  if (cleaned.length === 0) return fallback;
  return toTypeName(cleaned.join(' '), fallback);
}

/**
 * Render the type expression for a schema node.
 *
 * @param {object} node
 * @param {object} state  { registry, options, indent, path }
 */
function expression(node, state) {
  const alts = alternatives(node);
  if (alts.length === 1) return single(alts[0], state);

  const rendered = [];
  const seen = new Set();
  for (const alt of alts) {
    // Objects that get extracted into named types are handled by `single`, so
    // the same nested type is not declared twice inside one union.
    const text = single(alt, state);
    if (seen.has(text)) continue;
    seen.add(text);
    rendered.push(text);
  }
  if (rendered.length === 1) return rendered[0];
  return rendered.join(' | ');
}

function single(node, state) {
  switch (node.kind) {
    case NodeKind.PRIMITIVE:
      return TS_PRIMITIVE[node.type] ?? 'unknown';

    case NodeKind.ARRAY: {
      const inner = expression(node.element, { ...state, path: [...state.path, 'Item'] });
      const needsParens = inner.includes(' | ');
      const item = needsParens ? `(${inner})` : inner;
      return state.options.arraysAs === 'Array' ? `Array<${item}>` : `${item}[]`;
    }

    case NodeKind.OBJECT: {
      // The inline rendering must not be built when nested extraction is on: it
      // walks every field, and walking claims the names of the nested types — so
      // evaluating it here as well would declare each nested type twice, once
      // under its own name and once with a numeric suffix.
      if (!state.options.extractNested) return inlineObject(node, state);

      const name = state.registry.claim(typeNameFromPath(state.path, 'Nested'));
      if (!state.registry.byName.has(name)) {
        // Reserve the name first so a recursive-looking path cannot claim it twice.
        state.registry.declare(name, () => '');
        const body = bodyObject(node, { ...state, path: state.path, ownName: name });
        state.registry.declare(name, (typeName, indent) =>
          state.options.declaration === 'interface'
            ? `${state.options.exported ? 'export ' : ''}interface ${typeName} ${body(indent)}`
            : `${state.options.exported ? 'export ' : ''}type ${typeName} = ${body(indent)};`,
        );
      }
      return name;
    }

    default:
      return 'unknown';
  }
}

/** `{ a: string; b?: number }` on one line — used for shallow inline objects. */
function inlineObject(node, state) {
  const fields = objectFields(node);
  if (fields.length === 0) return isUnknown(node) ? 'unknown' : 'Record<string, never>';
  const parts = fields.map((field) => {
    const optional = field.optional ? '?' : '';
    const readonly = state.options.readonly ? 'readonly ' : '';
    const value = expression(field.node, { ...state, path: [...state.path, field.name] });
    return `${readonly}${quoteIfNeeded(field.name)}${optional}: ${value}`;
  });
  return `{ ${parts.join('; ')} }`;
}

/**
 * Build the multi-line body of a named object type.
 * Returns a function of (indent) so the registry can render lazily.
 */
function bodyObject(node, state) {
  return (indent) => {
    const fields = objectFields(node);
    const inner = indent + indentUnit(state.options);
    if (fields.length === 0) return '{}';

    const lines = fields.map((field) => {
      const optional = field.optional ? '?' : '';
      const readonly = state.options.readonly ? 'readonly ' : '';
      const value = expression(field.node, { ...state, path: [...state.path, field.name] });
      return `${inner}${readonly}${quoteIfNeeded(field.name)}${optional}: ${value};`;
    });
    return `{\n${lines.join('\n')}\n${indent}}`;
  };
}

/** Convenience wrapper: build the whole file for a root schema node. */
export function generateTypeScript(schema, options = {}) {
  const settings = {
    declaration: 'type',
    extractNested: true,
    readonly: false,
    exported: true,
    arraysAs: '[]',
    typeName: 'Root',
    ...options,
  };
  const registry = new TypeRegistry();
  const rootName = toTypeName(settings.typeName, 'Root');
  const state = { registry, options: settings, path: [] };

  // The root is always named explicitly, so claim its name up front.
  registry.usedNames.add(rootName);
  const rootBody = bodyObject(schema, { ...state, path: [rootName], ownName: rootName });

  const declaration = settings.declaration === 'interface'
    ? `${settings.exported ? 'export ' : ''}interface ${rootName} ${rootBody('')}`
    : `${settings.exported ? 'export ' : ''}type ${rootName} = ${rootBody('')};`;

  const nested = registry.render('');
  return [declaration, ...nested].join('\n\n');
}

/* ------------------------------------------------------------------ *
 * Formatter entries
 * ------------------------------------------------------------------ */

function rootOptions(ctx) {
  return {
    declaration: ctx.options.tsDeclaration ?? 'type',
    extractNested: ctx.options.tsExtractNested !== false,
    readonly: ctx.options.tsReadonly === true,
    exported: ctx.options.tsExported !== false,
    arraysAs: ctx.options.tsArraysAs ?? '[]',
    typeName: ctx.options.typeName || 'Root',
    indent: ctx.options.indent,
  };
}

export const typeScriptFormatters = [
  {
    id: 'ts-type',
    label: 'TypeScript type',
    group: 'types',
    hint: 'A `type` alias with nested objects extracted into their own named types',
    schema: true,
    run: (ctx) => generateTypeScript(ctx.schema, { ...rootOptions(ctx), declaration: 'type', extractNested: true }),
  },
  {
    id: 'ts-inline',
    label: 'TypeScript type (inline)',
    group: 'types',
    hint: 'One self-contained `type` alias, nested objects written inline',
    schema: true,
    run: (ctx) => generateTypeScript(ctx.schema, { ...rootOptions(ctx), declaration: 'type', extractNested: false }),
  },
  {
    id: 'ts-interface',
    label: 'TypeScript interfaces',
    group: 'types',
    hint: 'An `interface` per nested object, ready to drop into a types file',
    schema: true,
    run: (ctx) => generateTypeScript(ctx.schema, { ...rootOptions(ctx), declaration: 'interface', extractNested: true }),
  },
  {
    id: 'ts-leaves',
    label: 'TypeScript leaf fields',
    group: 'types',
    hint: 'Flat list of primitive leaves with their inferred types',
    run: (ctx) => {
      const lines = ctx.items.map((item) => {
        const type = leafTypeLabel(item.field.value);
        const optional = item.field.isLeaf ? '' : '?';
        return `  ${quoteIfNeeded(item.name)}${optional}: ${type};`;
      });
      return `type ${toTypeName(ctx.options.typeName || 'Root', 'Root')} = {\n${lines.join('\n')}\n};`;
    },
  },
];

function leafTypeLabel(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'unknown[]';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'unknown';
  }
}

/** Re-exported so tests and the Zod generator can reuse the TS primitives. */
export { TS_PRIMITIVE, expression as tsExpression, typeNameFromPath };
export { CaseMode };
