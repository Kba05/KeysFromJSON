/**
 * Zod schema output.
 *
 * Zod expresses optionality and nullability as chained calls, so the two are
 * mapped separately: a key missing from some array elements gets `.optional()`,
 * a key whose value can be `null` gets `.nullable()`.
 *
 * Indentation is threaded through the recursion as a depth rather than applied
 * afterwards: a nested `z.object({…})` has to be indented relative to its own
 * parent, and re-indenting a flat string cannot recover that.
 */

import { toTypeName, quoteIfNeeded } from '../core/naming.js';
import { alternatives, isNullable, isUnknown, NodeKind, objectFields } from '../core/schema.js';
import { indentUnit } from './helpers.js';

function coreZod(node, options, depth) {
  const unit = indentUnit(options);

  switch (node.kind) {
    case NodeKind.PRIMITIVE:
      if (node.type === 'string') return 'z.string()';
      if (node.type === 'number') return 'z.number()';
      if (node.type === 'boolean') return 'z.boolean()';
      if (node.type === 'null') return 'z.null()';
      return 'z.unknown()';

    case NodeKind.ARRAY:
      // The element keeps the array's own depth so a multi-line object inside
      // `z.array(...)` lines up with the property it belongs to.
      return isUnknown(node.element) ? 'z.array(z.unknown())' : `z.array(${zodOf(node.element, options, depth)})`;

    case NodeKind.OBJECT: {
      const fields = objectFields(node);
      if (fields.length === 0) return 'z.object({})';
      const inner = unit.repeat(depth + 1);
      const lines = fields.map((field) => {
        const type = zodOf(field.node, options, depth + 1);
        const optional = field.optional ? '.optional()' : '';
        return `${inner}${quoteIfNeeded(field.name)}: ${type}${optional},`;
      });
      return `z.object({\n${lines.join('\n')}\n${unit.repeat(depth)}})`;
    }

    default:
      return 'z.unknown()';
  }
}

/**
 * Render a schema node as a Zod expression.
 *
 * @param {object} node
 * @param {{indent?: number|'tab'}} [options]
 * @param {number} [depth] current nesting depth, used for indentation only
 */
export function zodOf(node, options = {}, depth = 0) {
  const alts = alternatives(node);

  if (alts.length === 1) {
    // A pure `null` type is already exact; `.nullable()` on top would be noise.
    if (alts[0].kind === NodeKind.PRIMITIVE && alts[0].type === 'null') return 'z.null()';
    const base = coreZod(alts[0], options, depth);
    return isNullable(node) ? `${base}.nullable()` : base;
  }

  const nonNull = alts.filter((alt) => !(alt.kind === NodeKind.PRIMITIVE && alt.type === 'null'));
  const rendered = [...new Set(nonNull.map((alt) => zodOf(alt, options, depth)))];
  const union = rendered.length === 1 ? rendered[0] : `z.union([${rendered.join(', ')}])`;
  return isNullable(node) ? `${union}.nullable()` : union;
}

export const zodFormatters = [
  {
    id: 'zod-schema',
    label: 'Zod schema',
    group: 'types',
    hint: 'Runtime validation schema with optional and nullable preserved',
    schema: true,
    run: (ctx) => {
      const name = toTypeName(ctx.options.typeName || 'Root', 'Root');
      const body = zodOf(ctx.schema, { indent: ctx.options.indent });
      return [
        `export const ${name}Schema = ${body};`,
        '',
        `export type ${name} = z.infer<typeof ${name}Schema>;`,
      ].join('\n');
    },
  },
];
