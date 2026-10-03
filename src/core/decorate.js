/**
 * Turn a flat field list into the final, ordered list of names to show or copy.
 *
 * This is the stage where the old single-file version had almost everything
 * hard-coded. Here every decision is an explicit option: which records survive
 * filtering, how a name is derived, how it is wrapped, whether duplicates are
 * collapsed and how the result is ordered.
 */

import { ARRAY_MARKER } from './extract.js';
import { formatPath, PathStyle } from './keypath.js';
import { applyCase, CaseMode, wrapKey } from './naming.js';

/** Restrict output to keys, to containers or keep everything. */
export const NodeFilter = {
  ALL: 'all',
  LEAF: 'leaf',
  CONTAINER: 'container',
};

export const NODE_FILTER_LABELS = {
  [NodeFilter.ALL]: 'All keys',
  [NodeFilter.LEAF]: 'Leaf keys only',
  [NodeFilter.CONTAINER]: 'Objects & arrays only',
};

/** Result ordering. */
export const SortMode = {
  DOCUMENT: 'document',
  ALPHA: 'alpha',
  ALPHA_DESC: 'alpha-desc',
  DEPTH: 'depth',
  DEPTH_DESC: 'depth-desc',
  LENGTH: 'length',
};

export const SORT_LABELS = {
  [SortMode.DOCUMENT]: 'Document order',
  [SortMode.ALPHA]: 'A → Z',
  [SortMode.ALPHA_DESC]: 'Z → A',
  [SortMode.DEPTH]: 'Shallow first',
  [SortMode.DEPTH_DESC]: 'Deep first',
  [SortMode.LENGTH]: 'Shortest first',
};

/** What the produced name is based on. */
export const NameSource = {
  KEY: 'key',
  PATH: 'path',
};

/** What duplicates are detected by. */
export const DedupeBy = {
  NAME: 'name',
  PATH: 'path',
  NONE: 'none',
};

/** Separators between entries. */
export const Separator = {
  COMMA_SPACE: 'comma-space',
  COMMA_NEWLINE: 'comma-newline',
  COMMA_NEWLINE_LEAD: 'comma-newline-lead',
  NEWLINE: 'newline',
  SPACE: 'space',
  SEMICOLON: 'semicolon',
  PIPE: 'pipe',
};

export const SEPARATOR_VALUES = {
  [Separator.COMMA_SPACE]: ', ',
  [Separator.COMMA_NEWLINE]: ',\n',
  [Separator.COMMA_NEWLINE_LEAD]: ', \n',
  [Separator.NEWLINE]: '\n',
  [Separator.SPACE]: ' ',
  [Separator.SEMICOLON]: '; ',
  [Separator.PIPE]: ' | ',
};

export const SEPARATOR_LABELS = {
  [Separator.COMMA_SPACE]: 'Comma + space',
  [Separator.COMMA_NEWLINE]: 'Comma + newline',
  [Separator.COMMA_NEWLINE_LEAD]: 'Comma + newline (leading)',
  [Separator.NEWLINE]: 'One per line',
  [Separator.SPACE]: 'Space',
  [Separator.SEMICOLON]: 'Semicolon',
  [Separator.PIPE]: 'Pipe',
};

/** The default separator reproduces the original tool's comma-plus-newline look. */
export const DEFAULT_SEPARATOR = Separator.COMMA_NEWLINE;

/**
 * Compile a user-supplied pattern.
 *
 * Accepts `/source/flags` or a bare regular-expression source. Invalid patterns
 * are reported instead of thrown: the input box is live, so half-typed patterns
 * are normal.
 *
 * @param {string} text
 * @returns {{regex: RegExp|null, error: string|null}}
 */
export function compilePattern(text) {
  const source = String(text ?? '').trim();
  if (!source) return { regex: null, error: null };

  let pattern = source;
  let flags = '';
  const literal = /^\/(.*)\/([dgimsuvy]*)$/.exec(source);
  if (literal) {
    pattern = literal[1];
    flags = literal[2];
  }

  try {
    return { regex: new RegExp(pattern, flags), error: null };
  } catch (error) {
    return { regex: null, error: String(error.message || error) };
  }
}

function compare(a, b, mode) {
  switch (mode) {
    case SortMode.ALPHA:
      return a.name.localeCompare(b.name);
    case SortMode.ALPHA_DESC:
      return b.name.localeCompare(a.name);
    case SortMode.DEPTH:
      return a.depth - b.depth || a.name.localeCompare(b.name);
    case SortMode.DEPTH_DESC:
      return b.depth - a.depth || a.name.localeCompare(b.name);
    case SortMode.LENGTH:
      return a.name.length - b.name.length || a.name.localeCompare(b.name);
    default:
      return a.id - b.id;
  }
}

/**
 * Build the ordered list of names.
 *
 * @param {import('./extract.js').Field[]} fields
 * @param {object} [options]
 * @returns {{items: object[], stats: object, errors: object}}
 */
export function buildKeyItems(fields, options = {}) {
  const {
    wrap = { left: '"', right: '"' },
    caseMode = CaseMode.NONE,
    pathStyle = PathStyle.DOT_BRACKET,
    realIndices = false,
    nodeFilter = NodeFilter.ALL,
    maxDepth = null,
    includePattern = '',
    excludePattern = '',
    search = '',
    selected = null,
    nameSource = NameSource.KEY,
    dedupeBy = DedupeBy.NAME,
    ignoreCase = false,
    sort = SortMode.DOCUMENT,
  } = options;

  const include = compilePattern(includePattern);
  const exclude = compilePattern(excludePattern);
  const needle = search.trim().toLowerCase();

  const errors = {
    include: include.error,
    exclude: exclude.error,
  };

  const candidates = [];
  let scanned = 0;

  for (const field of fields) {
    scanned += 1;

    if (nodeFilter === NodeFilter.LEAF && !field.isLeaf) continue;
    if (nodeFilter === NodeFilter.CONTAINER && field.isLeaf) continue;
    if (maxDepth !== null && Number.isFinite(maxDepth) && field.depth > maxDepth) continue;
    if (selected && !selected.has(field.id)) continue;
    if (include.regex && !include.regex.test(field.key)) continue;
    if (exclude.regex && exclude.regex.test(field.key)) continue;

    // Case conversion applies per path segment so paths stay consistent.
    const segments = caseMode === CaseMode.NONE
      ? field.segments
      : field.segments.map((segment) => (segment === ARRAY_MARKER ? segment : applyCase(segment, caseMode)));
    const key = caseMode === CaseMode.NONE ? field.key : applyCase(field.key, caseMode);
    const path = formatPath(segments, field.realSegments, { style: pathStyle, realIndices });
    const name = nameSource === NameSource.PATH ? path : key;

    if (needle && !name.toLowerCase().includes(needle) && !path.toLowerCase().includes(needle)) continue;

    candidates.push({
      id: field.id,
      field,
      // The case-transformed path segments are kept so later stages — path
      // formatters and the custom template — can re-render in another notation
      // without recomputing the case rules.
      segments,
      key,
      name,
      path,
      depth: field.depth,
      valueType: field.valueType,
      text: wrapKey(name, wrap),
    });
  }

  const matched = candidates.length;
  let items = candidates;

  if (dedupeBy !== DedupeBy.NONE) {
    const seen = new Set();
    items = [];
    for (const item of candidates) {
      // "By name" means by the field name, not by whatever the output prints: when
      // paths are the output, name de-duplication still collapses `a.id` and `b.id`
      // into one entry, while `path` keeps them apart.
      const dedupeKeyValue = dedupeBy === DedupeBy.PATH ? item.path : item.key;
      const bucket = ignoreCase ? dedupeKeyValue.toLowerCase() : dedupeKeyValue;
      if (seen.has(bucket)) continue;
      seen.add(bucket);
      items.push(item);
    }
  }

  if (sort !== SortMode.DOCUMENT) items = [...items].sort((a, b) => compare(a, b, sort));

  return {
    items,
    stats: {
      scanned,
      matched,
      unique: items.length,
      duplicates: matched - items.length,
      maxDepth: fields.reduce((max, field) => Math.max(max, field.depth), 0),
    },
    errors,
  };
}

/** Join prepared items with a separator key or a raw separator string. */
export function joinKeyItems(items, separator = DEFAULT_SEPARATOR) {
  const value = SEPARATOR_VALUES[separator] ?? separator;
  return items.map((item) => item.text).join(value);
}

/** Convenience: filter, decorate and join in one call. */
export function renderKeyList(fields, options = {}) {
  const { items, stats, errors } = buildKeyItems(fields, options);
  return {
    text: joinKeyItems(items, options.separator ?? DEFAULT_SEPARATOR),
    items,
    stats,
    errors,
  };
}
