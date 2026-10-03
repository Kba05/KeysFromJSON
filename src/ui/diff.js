/**
 * Comparing key paths across two documents.
 *
 * The interesting question when two payloads disagree is rarely "what are the
 * keys" but "which keys exist only on one side" — a v1/v2 response diff, a
 * staging/production config diff, a before/after migration check.
 */

import { extractAll } from '../core/extract.js';
import { formatPath } from '../core/keypath.js';

/** Every distinct key path in one document, in the requested notation. */
export function pathSetOf(doc, options = {}) {
  const paths = new Set();
  for (const field of extractAll([doc])) {
    paths.add(
      formatPath(field.segments, field.realSegments, {
        style: options.pathStyle,
        realIndices: options.realIndices === true,
      }),
    );
  }
  return paths;
}

export const COMPARE_MODES = {
  UNION: 'union',
  INTERSECTION: 'intersection',
  ONLY_A: 'only-a',
  ONLY_B: 'only-b',
};

/**
 * Compare two path sets.
 *
 * @returns {{path: string, inA: boolean, inB: boolean, origin: 'both'|'a'|'b'}[]}
 */
export function comparePathSets(a, b, mode = COMPARE_MODES.UNION) {
  const all = [...new Set([...a, ...b])].sort((left, right) => left.localeCompare(right));
  const rows = [];
  for (const path of all) {
    const inA = a.has(path);
    const inB = b.has(path);
    const include =
      mode === COMPARE_MODES.UNION ||
      (mode === COMPARE_MODES.INTERSECTION && inA && inB) ||
      (mode === COMPARE_MODES.ONLY_A && inA && !inB) ||
      (mode === COMPARE_MODES.ONLY_B && inB && !inA);
    if (!include) continue;
    rows.push({ path, inA, inB, origin: inA && inB ? 'both' : inA ? 'a' : 'b' });
  }
  return rows;
}

const MODE_TITLES = {
  [COMPARE_MODES.UNION]: 'Union of both documents',
  [COMPARE_MODES.INTERSECTION]: 'Paths present in both documents',
  [COMPARE_MODES.ONLY_A]: 'Paths only in the first document',
  [COMPARE_MODES.ONLY_B]: 'Paths only in the second document',
};

/**
 * Render a comparison as text.
 *
 * A shared path is left unmarked, an A-only path is prefixed `- ` and a B-only
 * path `+ `, which is the diff convention people already read fluently.
 */
export function renderComparison(rows, mode = COMPARE_MODES.UNION) {
  const onlyA = rows.filter((row) => row.origin === 'a').length;
  const onlyB = rows.filter((row) => row.origin === 'b').length;
  const both = rows.filter((row) => row.origin === 'both').length;

  const header = [
    MODE_TITLES[mode] ?? 'Comparison',
    `${rows.length} paths — ${both} shared, ${onlyA} only in A, ${onlyB} only in B`,
    mode === COMPARE_MODES.UNION ? '  (blank) shared   -  only A   +  only B' : '',
    '',
  ].filter((line) => line !== '');

  const body = rows.map((row) => {
    if (row.origin === 'both') return `  ${row.path}`;
    return row.origin === 'a' ? `- ${row.path}` : `+ ${row.path}`;
  });

  return [...header, ...body].join('\n');
}
