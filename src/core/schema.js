/**
 * Structural schema of a document, or of several merged documents.
 *
 * The flat field list from `extract.js` answers "which keys exist". Type and
 * database generators need something a flat list cannot express: which keys
 * always appear, and what types they hold. This module builds and merges that
 * tree.
 *
 * Where a value is ambiguous — `[1, "a"]`, or two documents whose `id` is a
 * number in one and a string in the other — the result is a union node rather
 * than a guess.
 */

/** Node kinds. */
export const NodeKind = {
  PRIMITIVE: 'primitive',
  OBJECT: 'object',
  ARRAY: 'array',
  UNION: 'union',
  UNKNOWN: 'unknown',
};

/** Only these count as primitives; everything else becomes an unknown node. */
const PRIMITIVE_ORDER = ['string', 'number', 'boolean', 'null'];

/**
 * The JSON type of a value, used to dispatch inside `schemaOf`.
 *
 * Containers must report `'object'` here so the object and array branches below
 * are reachable; anything that is not a JSON value at all (a function, a symbol,
 * `undefined`) reports `'unknown'`.
 */
function primitiveTypeOf(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'object') return type;
  return 'unknown';
}

const PRIMITIVE_KINDS = new Set(['string', 'number', 'boolean', 'null']);

/** Build a schema node for a single value. */
export function schemaOf(value) {
  const kind = primitiveTypeOf(value);
  if (kind === 'unknown') return { kind: NodeKind.UNKNOWN };

  if (PRIMITIVE_KINDS.has(kind)) {
    const node = { kind: NodeKind.PRIMITIVE, type: kind };
    // Recording the longest sample lets the SQL generator suggest VARCHAR(n).
    if (kind === 'string') node.maxLength = value.length;
    return node;
  }

  if (Array.isArray(value)) {
    const builder = new NodeBuilder();
    for (const item of value) builder.add(schemaOf(item));
    return { kind: NodeKind.ARRAY, count: 1, element: builder.build() };
  }

  const fields = new Map();
  for (const [name, fieldValue] of Object.entries(value)) {
    fields.set(name, { name, node: schemaOf(fieldValue), count: 1 });
  }
  return { kind: NodeKind.OBJECT, count: 1, fields };
}

/**
 * Accumulates nodes of differing kinds and folds them into one node.
 *
 * Merging this way is what makes repeated array elements work: every element of
 * `[{a: 1}, {a: 2, b: 3}]` lands in the same builder, so `a` comes out required
 * and `b` optional instead of producing two disjoint object types.
 */
class NodeBuilder {
  constructor() {
    this.primitives = new Map(); // type -> deepest string sample seen
    this.objects = [];
    this.arrays = [];
    this.sawUnknown = false;
  }

  add(node) {
    if (!node) {
      this.sawUnknown = true;
      return this;
    }
    switch (node.kind) {
      case NodeKind.PRIMITIVE: {
        const previous = this.primitives.get(node.type) ?? 0;
        this.primitives.set(node.type, Math.max(previous, node.maxLength ?? 0));
        break;
      }
      case NodeKind.OBJECT:
        this.objects.push(node);
        break;
      case NodeKind.ARRAY:
        this.arrays.push(node);
        break;
      case NodeKind.UNION:
        for (const type of node.types) this.add(type);
        break;
      default:
        this.sawUnknown = true;
    }
    return this;
  }

  build() {
    const parts = [];

    if (this.primitives.size > 0) {
      const types = [...this.primitives.keys()].sort(
        (a, b) => PRIMITIVE_ORDER.indexOf(a) - PRIMITIVE_ORDER.indexOf(b),
      );
      const nodes = types.map((type) => {
        const node = { kind: NodeKind.PRIMITIVE, type };
        const length = this.primitives.get(type);
        if (type === 'string' && length > 0) node.maxLength = length;
        return node;
      });
      parts.push(nodes.length === 1 ? nodes[0] : { kind: NodeKind.UNION, types: nodes });
    }

    if (this.objects.length > 0) parts.push(mergeObjects(this.objects));
    if (this.arrays.length > 0) parts.push(mergeArrays(this.arrays));

    if (parts.length === 0) return { kind: NodeKind.UNKNOWN };
    if (parts.length === 1) return parts[0];

    // Flatten nested unions so consumers only ever see one level.
    const types = parts.flatMap((part) => (part.kind === NodeKind.UNION ? part.types : [part]));
    return { kind: NodeKind.UNION, types };
  }
}

function mergeObjects(objects) {
  const fields = new Map();
  let count = 0;
  for (const object of objects) {
    count += object.count;
    for (const [name, field] of object.fields) {
      const existing = fields.get(name);
      if (existing) {
        const builder = new NodeBuilder();
        builder.add(existing.node).add(field.node);
        fields.set(name, { name, node: builder.build(), count: existing.count + field.count });
      } else {
        fields.set(name, { name, node: field.node, count: field.count });
      }
    }
  }
  return { kind: NodeKind.OBJECT, count, fields };
}

function mergeArrays(arrays) {
  const builder = new NodeBuilder();
  let count = 0;
  for (const array of arrays) {
    count += array.count;
    builder.add(array.element);
  }
  return { kind: NodeKind.ARRAY, count, element: builder.build() };
}

/** Merge two schema nodes. */
export function mergeNodes(a, b) {
  return new NodeBuilder().add(a).add(b).build();
}

/**
 * Merge a whole set of documents into one schema.
 *
 * @param {unknown[]} docs
 * @returns {object} one schema node describing every document
 */
export function buildSchema(docs) {
  const builder = new NodeBuilder();
  for (const doc of docs) builder.add(schemaOf(doc));
  return builder.build();
}

/* ------------------------------------------------------------------ *
 * Readers — small helpers so generators never poke at node internals.
 * ------------------------------------------------------------------ */

/** Flatten a node into its concrete alternatives. */
export function alternatives(node) {
  if (!node) return [{ kind: NodeKind.UNKNOWN }];
  if (node.kind === NodeKind.UNION) return node.types.flatMap(alternatives);
  return [node];
}

/** The primitive types a node can hold, in a stable order. */
export function primitiveTypes(node) {
  const types = new Set();
  for (const alt of alternatives(node)) {
    if (alt.kind === NodeKind.PRIMITIVE) types.add(alt.type);
  }
  return PRIMITIVE_ORDER.filter((type) => types.has(type));
}

/** True when the node can be `null`. */
export function isNullable(node) {
  return primitiveTypes(node).includes('null');
}

/** The node without its `null` alternative. */
export function withoutNull(node) {
  const rest = alternatives(node).filter((alt) => !(alt.kind === NodeKind.PRIMITIVE && alt.type === 'null'));
  if (rest.length === 0) return { kind: NodeKind.PRIMITIVE, type: 'null' };
  if (rest.length === 1) return rest[0];
  return { kind: NodeKind.UNION, types: rest };
}

/** True when the node can be an object. */
export function hasObject(node) {
  return alternatives(node).some((alt) => alt.kind === NodeKind.OBJECT);
}

/** True when the node can be an array. */
export function hasArray(node) {
  return alternatives(node).some((alt) => alt.kind === NodeKind.ARRAY);
}

/** True when there is nothing to say about the node. */
export function isUnknown(node) {
  return alternatives(node).every((alt) => alt.kind === NodeKind.UNKNOWN);
}

/** The merged element schema of every array alternative. */
export function arrayElement(node) {
  const builder = new NodeBuilder();
  for (const alt of alternatives(node)) {
    if (alt.kind === NodeKind.ARRAY) builder.add(alt.element);
  }
  return builder.build();
}

/** The single object alternative of a node, if it has one. */
export function objectNode(node) {
  return alternatives(node).find((alt) => alt.kind === NodeKind.OBJECT) ?? null;
}

/**
 * Fields of an object node.
 *
 * `optional` is resolved here: within a merged object, `node.count` is how many
 * object instances were folded in and `field.count` how many of them carried
 * that key, so a mismatch means the key is absent somewhere.
 *
 * @returns {{name: string, node: object, optional: boolean}[]}
 */
export function objectFields(node) {
  const object = objectNode(node);
  if (!object) return [];
  return [...object.fields.values()].map((field) => ({
    name: field.name,
    node: field.node,
    optional: field.count < object.count,
  }));
}

/** How many object instances were merged into a node. */
export function objectCount(node) {
  const object = objectNode(node);
  return object ? object.count : 0;
}

/** A short human label for a node, e.g. `string | null` or `array<object>`. */
export function typeLabel(node) {
  const parts = alternatives(node).map((alt) => {
    switch (alt.kind) {
      case NodeKind.PRIMITIVE:
        return alt.type;
      case NodeKind.OBJECT:
        return 'object';
      case NodeKind.ARRAY: {
        const inner = typeLabel(alt.element);
        return inner === 'unknown' ? 'array' : `array<${inner}>`;
      }
      default:
        return 'unknown';
    }
  });
  return [...new Set(parts)].join(' | ');
}

/** A neutral SQL column type for a node. */
export function sqlTypeOf(node) {
  if (hasArray(node) || hasObject(node)) return 'JSON';
  const types = primitiveTypes(withoutNull(node));
  if (types.length !== 1) return 'TEXT';
  switch (types[0]) {
    case 'number':
      return 'NUMERIC';
    case 'boolean':
      return 'BOOLEAN';
    default:
      return 'TEXT';
  }
}
