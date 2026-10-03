/**
 * The "just give me the keys" family.
 *
 * `quoted-list` is the behaviour the original tool shipped; the rest are the
 * shapes developers reach for immediately afterwards.
 */

import { DEFAULT_SEPARATOR, joinKeyItems, SEPARATOR_VALUES } from '../core/decorate.js';
import { stringifyJson } from '../core/json-parse.js';

/** Resolve the configured separator to a real string. */
export function separatorOf(options = {}) {
  const key = options.separator ?? DEFAULT_SEPARATOR;
  return SEPARATOR_VALUES[key] ?? key;
}

/** Quote a CSV cell only when it needs it (RFC 4180). */
export function csvCell(text) {
  const value = String(text);
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Column-oriented formats describe table columns, not the set of every key, so
 * they default to leaf keys. `ctx.options.columnsLeavesOnly === false` restores
 * the full key list for anyone who really wants the containers too.
 */
function columnItems(ctx) {
  return ctx.options.columnsLeavesOnly === false
    ? ctx.items
    : ctx.items.filter((item) => item.field.isLeaf);
}

export const listFormatters = [
  {
    id: 'quoted-list',
    label: 'Quoted key list',
    group: 'list',
    hint: 'The original output: every key wrapped in the chosen characters',
    run: (ctx) => joinKeyItems(ctx.items, ctx.options.separator ?? DEFAULT_SEPARATOR),
  },
  {
    id: 'bare-list',
    label: 'Bare names',
    group: 'list',
    hint: 'Key names with no wrapper at all',
    run: (ctx) => ctx.items.map((item) => item.name).join(separatorOf(ctx.options)),
  },
  {
    id: 'json-array',
    label: 'JSON array',
    group: 'list',
    hint: 'A JSON array of the key names',
    run: (ctx) => stringifyJson(ctx.items.map((item) => item.name), ctx.options.indent ?? 2),
  },
  {
    id: 'json-lines',
    label: 'JSON Lines',
    group: 'list',
    hint: 'One JSON string per line — ready for `jq` and other line tools',
    run: (ctx) => ctx.items.map((item) => JSON.stringify(item.name)).join('\n'),
  },
  {
    id: 'csv-header',
    label: 'CSV header row',
    group: 'list',
    hint: 'Leaf keys as a single comma-separated header line',
    // Flagged so the UI can say why the output has fewer entries than the key list.
    leafOnly: true,
    run: (ctx) => columnItems(ctx).map((item) => csvCell(item.name)).join(','),
  },
  {
    id: 'tsv-row',
    label: 'Tab-separated row',
    group: 'list',
    hint: 'Leaf keys as one tab-separated line, for pasting into a spreadsheet',
    leafOnly: true,
    run: (ctx) => columnItems(ctx).map((item) => item.name.replace(/\t/g, ' ')).join('\t'),
  },
  {
    id: 'count-report',
    label: 'Count report',
    group: 'other',
    hint: 'A short summary of what was found — handy for a PR description',
    run: (ctx) => {
      const { stats } = ctx;
      const types = new Map();
      for (const item of ctx.items) types.set(item.valueType, (types.get(item.valueType) ?? 0) + 1);
      const typeLines = [...types.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `  ${type.padEnd(8)} ${count}`);
      return [
        `Keys scanned:    ${stats.scanned}`,
        `Matched filter:  ${stats.matched}`,
        `Unique output:   ${stats.unique}`,
        `Duplicates:      ${stats.duplicates}`,
        `Max depth:       ${stats.maxDepth}`,
        `Documents:       ${ctx.docs.length}`,
        '',
        'Value types in the output:',
        ...typeLines,
      ].join('\n');
    },
  },
];
