/**
 * The formatter registry.
 *
 * Adding an output format means adding an entry to one of the modules below and
 * exporting it from its array — nothing else in the app needs to change, which
 * is the point of keeping formatters as plain data plus a pure `run`.
 */

import { listFormatters } from './list.js';
import { pathFormatters } from './paths.js';
import { jsonFormatters } from './json.js';
import { zodFormatters } from './zod.js';
import { templateFormatters } from './template.js';
import { typeScriptFormatters } from './typescript.js';
import { codeFormatters } from './code-langs.js';
import { sqlFormatters } from './sql.js';
import { yamlFormatters } from './yaml.js';

/**
 * Every formatter, in the order the UI groups them.
 *
 * @type {{id: string, label: string, group: string, hint: string, schema?: boolean, run: (ctx: object) => string}[]}
 */
export const FORMATTERS = [
  ...listFormatters,
  ...pathFormatters,
  ...typeScriptFormatters,
  ...zodFormatters,
  ...codeFormatters,
  ...sqlFormatters,
  ...yamlFormatters,
  ...jsonFormatters,
  ...templateFormatters,
];

/** Group keys in display order, with their headings. */
export const FORMAT_GROUPS = [
  { id: 'list', label: 'Key lists' },
  { id: 'paths', label: 'Key paths' },
  { id: 'types', label: 'TypeScript & schemas' },
  { id: 'lang', label: 'Other languages' },
  { id: 'sql', label: 'SQL' },
  { id: 'data', label: 'Data formats' },
  { id: 'other', label: 'Other' },
];

/** The format selected on first load: the original tool's behaviour. */
export const DEFAULT_FORMAT_ID = 'quoted-list';

/** Look up a formatter by id. */
export function getFormatter(id) {
  return FORMATTERS.find((formatter) => formatter.id === id) ?? null;
}

/** Does this formatter need the parsed schema tree? */
export function formatterNeedsSchema(id) {
  return getFormatter(id)?.schema === true;
}

/**
 * Render one format.
 *
 * Returns `{ text, error }` instead of throwing: a formatter that fails should
 * cost the user an error message, not the whole page.
 */
export function renderFormat(id, ctx) {
  const formatter = getFormatter(id);
  if (!formatter) return { text: '', error: `Unknown format: ${id}` };
  try {
    return { text: formatter.run(ctx), error: null };
  } catch (error) {
    return { text: '', error: `${formatter.label} failed: ${error.message || error}` };
  }
}

/** Formatters grouped for a `<select>` with `<optgroup>`s. */
export function groupedFormatters() {
  return FORMAT_GROUPS.map((group) => ({
    ...group,
    formatters: FORMATTERS.filter((formatter) => formatter.group === group.id),
  })).filter((group) => group.formatters.length > 0);
}
