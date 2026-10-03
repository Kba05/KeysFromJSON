/**
 * Turn a parsed JSON document into the flat list of key occurrences it holds.
 *
 * This replaces the original `getNestedKeys()`, which had three defects:
 *
 *  1. `for (const key in value)` also walked *strings*, so `{"tags":["a","b"]}`
 *     leaked the character indices `"0"` and `"1"` as if they were property
 *     names;
 *  2. primitive array items produced `''`, and that empty string survived into
 *     the result, which is why output could start with a stray `, `;
 *  3. recursion returned an already-joined string, so `new Set(...)` deduped one
 *     branch at a time instead of globally — `{"r":[{"x":1,"y":2},{"x":3,"z":4}]}`
 *     emitted `"x"` twice.
 *
 * Records are emitted depth-first, parent before children, in document order.
 */

/** Placeholder standing in for "an element of this array" in a normalised path. */
export const ARRAY_MARKER = '[]';

/**
 * @typedef {object} Field
 * @property {number} id                 unique, and the position in the output array
 * @property {string[]} segments         normalised path; array elements are ARRAY_MARKER
 * @property {string[]} realSegments     same path, but array elements keep their real index
 * @property {string} key                the property name (never a marker)
 * @property {string[]} parentSegments   path of the containing value
 * @property {number} depth              0 for the document's own keys
 * @property {string} valueType          'object'|'array'|'string'|'number'|'boolean'|'null'
 * @property {unknown} value             the raw value behind the key
 * @property {boolean} isLeaf            true when the value contains no further keys
 * @property {number} childCount         keys directly inside the value
 * @property {number|null} arrayIndex    index of the enclosing array element, if any
 * @property {number} docIndex           which parsed document this came from
 */

/** The JSON type of a value, as a string. */
export function valueTypeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** True for values that can contain keys. */
export function isContainer(value) {
  const type = valueTypeOf(value);
  return type === 'object' || type === 'array';
}

function childCountOf(value) {
  if (Array.isArray(value)) {
    let count = 0;
    for (const item of value) if (isContainer(item)) count += 1;
    return count;
  }
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function visit(container, segments, realSegments, depth, arrayIndex, state, fields) {
  if (depth > state.maxDepth) return;

  if (Array.isArray(container)) {
    const isRootArray = segments.length === 0;
    for (let index = 0; index < container.length; index += 1) {
      const item = container[index];
      if (!isContainer(item)) continue; // primitive items hold no keys at all
      // A root-level array is treated as a list of records, so it does not add a
      // path segment: `[{ "a": 1 }]` yields the key path `a`, not `[].a`.
      const nextSegments = isRootArray ? segments : [...segments, ARRAY_MARKER];
      const nextReal = isRootArray ? realSegments : [...realSegments, String(index)];
      visit(item, nextSegments, nextReal, depth, index, state, fields);
    }
    return;
  }

  for (const key of Object.keys(container)) {
    const value = container[key];
    const childSegments = [...segments, key];
    const childReal = [...realSegments, key];
    const type = valueTypeOf(value);
    const container_ = type === 'object' || type === 'array';

    fields.push({
      id: fields.length,
      segments: childSegments,
      realSegments: childReal,
      key,
      parentSegments: segments,
      depth,
      valueType: type,
      value,
      isLeaf: !container_,
      childCount: container_ ? childCountOf(value) : 0,
      arrayIndex,
      docIndex: state.docIndex,
    });

    if (container_) visit(value, childSegments, childReal, depth + 1, null, state, fields);
  }
}

/**
 * Extract every key occurrence from one document.
 *
 * @param {unknown} doc
 * @param {{maxDepth?: number, docIndex?: number}} [options]
 *        `maxDepth` counts key nesting: the document's own keys are depth 0, so
 *        `maxDepth: 0` returns only top-level keys. Arrays do not consume a level.
 * @returns {Field[]}
 */
export function extractFields(doc, options = {}) {
  const state = {
    maxDepth: options.maxDepth ?? Number.POSITIVE_INFINITY,
    docIndex: options.docIndex ?? 0,
  };
  const fields = [];
  if (!isContainer(doc)) return fields;
  visit(doc, [], [], 0, null, state, fields);
  return fields;
}

/**
 * Extract from several documents, keeping `docIndex` on every record so the
 * merge/diff views can tell where a key came from.
 *
 * @param {unknown[]} docs
 * @param {{maxDepth?: number}} [options]
 */
export function extractAll(docs, options = {}) {
  const fields = [];
  docs.forEach((doc, docIndex) => {
    for (const field of extractFields(doc, { ...options, docIndex })) {
      fields.push({ ...field, id: fields.length });
    }
  });
  return fields;
}

/** How many distinct key names appear across the given records. */
export function countDistinctKeys(fields) {
  return new Set(fields.map((field) => field.key)).size;
}

/** The deepest key nesting present in the given records. */
export function maxDepthOf(fields) {
  let depth = 0;
  for (const field of fields) if (field.depth > depth) depth = field.depth;
  return depth;
}
