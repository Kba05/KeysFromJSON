/**
 * Custom template output.
 *
 * Instead of shipping one generator per house style, the template format lets a
 * user describe their own. It replaces the "please add another format" request
 * with something they can do themselves.
 *
 * Unknown tokens are left untouched rather than blanked, so a typo shows up in
 * the output instead of silently disappearing.
 */

import { DEFAULT_SEPARATOR, joinKeyItems } from '../core/decorate.js';

const TOKEN_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Tokens available in the per-key template. */
export const TEMPLATE_TOKENS = [
  { token: 'key', description: 'Key name after the case transform' },
  { token: 'raw', description: 'The key exactly as it appears in the JSON' },
  { token: 'name', description: 'Prepared name — key or path, per the Name source option' },
  { token: 'path', description: 'Path in the selected notation' },
  { token: 'wrapped', description: 'Name wrapped in the configured characters' },
  { token: 'type', description: 'JSON type of the value' },
  { token: 'index', description: '1-based position in the output' },
  { token: 'depth', description: 'Nesting depth, 0 for top-level keys' },
  { token: 'value', description: 'The value itself, truncated to 40 characters' },
];

/** Tokens available in the header and footer. */
export const SUMMARY_TOKENS = [
  { token: 'count', description: 'Number of keys in the output' },
  { token: 'unique', description: 'Unique keys after de-duplication' },
  { token: 'duplicates', description: 'Keys removed as duplicates' },
  { token: 'scanned', description: 'Keys seen before filtering' },
  { token: 'root', description: 'The type name from the options' },
  { token: 'docs', description: 'How many documents were parsed' },
];

/**
 * Substitute `{{token}}` placeholders.
 * Missing tokens are preserved verbatim so mistakes stay visible.
 */
export function applyTemplate(template, values) {
  return String(template ?? '').replace(TOKEN_RE, (match, token) => {
    const value = values[token];
    return value === undefined ? match : String(value);
  });
}

function truncateValue(value) {
  if (value === undefined) return 'undefined';
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

export const templateFormatters = [
  {
    id: 'custom-template',
    label: 'Custom template',
    group: 'other',
    hint: 'Your own line per key, with {{token}} placeholders',
    run: (ctx) => {
      const perKey = ctx.options.template || '{{wrapped}}';
      const header = ctx.options.templateHeader || '';
      const footer = ctx.options.templateFooter || '';
      const summary = {
        count: ctx.items.length,
        unique: ctx.stats.unique,
        duplicates: ctx.stats.duplicates,
        scanned: ctx.stats.scanned,
        root: ctx.options.typeName || 'Root',
        docs: ctx.docs.length,
      };

      const body = ctx.items
        .map((item, index) =>
          applyTemplate(perKey, {
            key: item.name,
            raw: item.field.key,
            name: item.name,
            path: item.path,
            wrapped: item.text,
            type: item.valueType,
            index: index + 1,
            depth: item.depth,
            value: truncateValue(item.field.value),
          }),
        )
        .join('\n');

      return [applyTemplate(header, summary), body, applyTemplate(footer, summary)]
        .filter((part) => part !== '')
        .join('\n');
    },
  },
  {
    id: 'template-list',
    label: 'Custom template (inline)',
    group: 'other',
    hint: 'The template rendered on one line, joined with the chosen separator',
    run: (ctx) => {
      const perKey = ctx.options.template || '{{wrapped}}';
      const rendered = ctx.items.map((item, index) =>
        applyTemplate(perKey, {
          key: item.name,
          raw: item.field.key,
          name: item.name,
          path: item.path,
          wrapped: item.text,
          type: item.valueType,
          index: index + 1,
          depth: item.depth,
          value: truncateValue(item.field.value),
        }),
      );
      // `joinKeyItems` works on prepared items, so join the raw strings here.
      const separator = ctx.options.separator ?? DEFAULT_SEPARATOR;
      const values = { 'comma-space': ', ', 'comma-newline': ',\n', 'comma-newline-lead': ', \n', newline: '\n', space: ' ', semicolon: '; ', pipe: ' | ' };
      return rendered.join(values[separator] ?? separator);
    },
  },
];

export { joinKeyItems };
