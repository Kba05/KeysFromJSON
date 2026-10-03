/**
 * Path notations.
 *
 * Each notation is its own output format, so choosing "JSONPath" in the output
 * list gives JSONPath regardless of the path style picked in the options.
 *
 * Paths are re-derived from `item.segments`, which already carry the requested
 * case transformation, and de-duplicated by the *rendered* path. Two different
 * keys can share a name (`a.id` and `b.id`) and that is exactly when a key list
 * is not enough but a path list is.
 */

import { DEFAULT_SEPARATOR, SEPARATOR_VALUES } from '../core/decorate.js';
import { formatPath, PATH_STYLE_EXAMPLES, PATH_STYLE_LABELS, PathStyle } from '../core/keypath.js';

function separatorOf(options = {}) {
  const key = options.separator ?? DEFAULT_SEPARATOR;
  return SEPARATOR_VALUES[key] ?? key;
}

/** Render every selected key as a path in one notation, de-duplicated. */
export function renderPaths(ctx, style) {
  const seen = new Set();
  const rendered = [];
  for (const item of ctx.items) {
    const path = formatPath(item.segments, item.field.realSegments, {
      style,
      realIndices: ctx.options.realIndices === true,
    });
    if (seen.has(path)) continue;
    seen.add(path);
    rendered.push(path);
  }
  return rendered.join(separatorOf(ctx.options));
}

function entry(style) {
  return {
    id: `path-${style}`,
    label: PATH_STYLE_LABELS[style],
    group: 'paths',
    hint: `e.g. ${PATH_STYLE_EXAMPLES[style]}`,
    run: (ctx) => renderPaths(ctx, style),
  };
}

export const pathFormatters = [
  entry(PathStyle.DOT_BRACKET),
  entry(PathStyle.DOT),
  entry(PathStyle.BRACKET),
  entry(PathStyle.JSONPATH),
  entry(PathStyle.JQ),
  entry(PathStyle.POINTER),
  entry(PathStyle.COLUMN),
];
