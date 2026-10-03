/**
 * Render the path of a key in the notations developers actually paste into code
 * or query tools.
 *
 * A path is carried as two parallel arrays: `segments` (array elements collapsed
 * to {@link ARRAY_MARKER}) and `realSegments` (array elements keep their index).
 * Working from both lets one renderer emit `list[0].name`, `list[].name` and
 * `list.name` without guessing which segment is an index.
 */

import { ARRAY_MARKER } from './extract.js';
import { applyCase, CaseMode, escapeDoubleQuoted, isValidBareName } from './naming.js';

/** Path notations offered in the UI. */
export const PathStyle = {
  DOT: 'dot',
  DOT_BRACKET: 'dotBracket',
  BRACKET: 'bracket',
  JSONPATH: 'jsonpath',
  JQ: 'jq',
  POINTER: 'pointer',
  COLUMN: 'column',
};

export const PATH_STYLE_LABELS = {
  [PathStyle.DOT]: 'dot',
  [PathStyle.DOT_BRACKET]: 'dot[index]',
  [PathStyle.BRACKET]: '["bracket"]',
  [PathStyle.JSONPATH]: 'JSONPath',
  [PathStyle.JQ]: 'jq',
  [PathStyle.POINTER]: 'JSON Pointer',
  [PathStyle.COLUMN]: 'column_name',
};

export const PATH_STYLE_EXAMPLES = {
  [PathStyle.DOT]: 'user.address.city',
  [PathStyle.DOT_BRACKET]: 'user.tags[0].name',
  [PathStyle.BRACKET]: 'user["tags"][0]["name"]',
  [PathStyle.JSONPATH]: '$.user.tags[0].name',
  [PathStyle.JQ]: '.user.tags[0].name',
  [PathStyle.POINTER]: '/user/tags/0/name',
  [PathStyle.COLUMN]: 'user_tags_name',
};

function escapePointerSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Render one key path.
 *
 * @param {string[]} segments      normalised segments (array elements are ARRAY_MARKER)
 * @param {string[]} realSegments  segments with real array indices
 * @param {{style?: string, realIndices?: boolean, columnCase?: string}} [options]
 * @returns {string}
 */
export function formatPath(segments, realSegments, options = {}) {
  const style = options.style || PathStyle.DOT_BRACKET;
  const realIndices = options.realIndices === true;
  const columnCase = options.columnCase || CaseMode.SNAKE;

  // Pair each segment with the notation an array element should use.
  const parts = segments.map((segment, index) => ({
    segment,
    isArray: segment === ARRAY_MARKER,
    index: realSegments[index] ?? String(index),
  }));

  const arrayToken = (part) => (realIndices ? part.index : null);

  switch (style) {
    case PathStyle.DOT:
      // Array elements are dropped: the "logical" field name, used for CSV headers.
      return parts
        .filter((part) => !part.isArray)
        .map((part) => part.segment)
        .join('.');

    case PathStyle.DOT_BRACKET:
      return parts
        .map((part) => {
          if (!part.isArray) return `.${part.segment}`;
          const token = arrayToken(part);
          return token === null ? '[]' : `[${token}]`;
        })
        .join('')
        .replace(/^\./, '');

    case PathStyle.BRACKET:
      // The root segment stays bare — `user["tags"][0]` is what a generated
      // accessor expression actually looks like.
      return parts
        .map((part, index) => {
          if (part.isArray) {
            const token = arrayToken(part);
            return token === null ? '[]' : `[${token}]`;
          }
          if (index === 0 && isValidBareName(part.segment)) return part.segment;
          return `["${escapeDoubleQuoted(part.segment)}"]`;
        })
        .join('');

    case PathStyle.JSONPATH:
      return (
        '$' +
        parts
          .map((part) => {
            if (!part.isArray) return `.${part.segment}`;
            const token = arrayToken(part);
            return token === null ? '[*]' : `[${token}]`;
          })
          .join('')
      );

    case PathStyle.JQ:
      return (
        parts
          .map((part) => {
            if (!part.isArray) return `.${part.segment}`;
            const token = arrayToken(part);
            return token === null ? '[]' : `[${token}]`;
          })
          .join('') || '.'
      );

    case PathStyle.POINTER:
      return `/${parts
        .map((part) => {
          if (!part.isArray) return escapePointerSegment(part.segment);
          const token = arrayToken(part);
          return token === null ? '*' : token;
        })
        .join('/')}`;

    case PathStyle.COLUMN:
      return parts
        .filter((part) => !part.isArray)
        .map((part) => applyCase(part.segment, columnCase))
        .filter(Boolean)
        .join('_');

    default:
      return segments.join('.');
  }
}

/** Convenience wrapper for a field record produced by `extractFields`. */
export function fieldPath(field, options) {
  return formatPath(field.segments, field.realSegments, options);
}

/** The last path segment, i.e. what most people mean by "the key". */
export function leafName(field) {
  return field.key;
}
