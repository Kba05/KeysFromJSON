/**
 * Select options and wrapper presets.
 *
 * The previous version stored each wrapper as a single `"left right"` string and
 * split it on a space, which cannot express a wrapper containing a space and
 * cannot express an asymmetric custom wrapper at all. Presets are real objects
 * here, so mustache braces, C-style block comments and interpolation syntax are
 * just data.
 */

import { CaseMode, CASE_LABELS } from '../core/naming.js';
import {
  NodeFilter,
  NODE_FILTER_LABELS,
  SEPARATOR_LABELS,
  Separator,
  SORT_LABELS,
  SortMode,
} from '../core/decorate.js';
import { PATH_STYLE_LABELS, PathStyle } from '../core/keypath.js';

/** Wrapper presets. `left`/`right` are used verbatim. */
export const WRAPPER_PRESETS = [
  { id: 'double', label: '"double quotes"', left: '"', right: '"' },
  { id: 'single', label: "'single quotes'", left: "'", right: "'" },
  { id: 'angle-single', label: '‹ ›', left: '‹', right: '›' },
  { id: 'angle', label: '< >', left: '<', right: '>' },
  { id: 'guillemet', label: '« »', left: '«', right: '»' },
  { id: 'ornament', label: '❝ ❞', left: '❝', right: '❞' },
  { id: 'ornament-small', label: '❛ ❜', left: '❛', right: '❜' },
  { id: 'parens', label: '( )', left: '(', right: ')' },
  { id: 'brackets', label: '[ ]', left: '[', right: ']' },
  { id: 'braces', label: '{ }', left: '{', right: '}' },
  { id: 'backtick', label: '` ` (SQL, JS template)', left: '`', right: '`' },
  { id: 'mustache', label: '{{ }} (Handlebars, Vue)', left: '{{', right: '}}' },
  { id: 'interpolation', label: '${ } (JS interpolation)', left: '${', right: '}' },
  { id: 'hash', label: '# # (shell, Python comment)', left: '#', right: '#' },
  { id: 'html-comment', label: '<!-- -->', left: '<!--', right: '-->' },
  { id: 'none', label: '(no wrapper)', left: '', right: '' },
];

export const DEFAULT_WRAPPER_PRESET_ID = 'double';

/** Find a preset by id, falling back to double quotes. */
export function wrapperPreset(id) {
  return WRAPPER_PRESETS.find((preset) => preset.id === id) ?? WRAPPER_PRESETS[0];
}

export const CASE_OPTIONS = Object.values(CaseMode).map((value) => ({ value, label: CASE_LABELS[value] }));

export const SEPARATOR_OPTIONS = Object.values(Separator).map((value) => ({
  value,
  label: SEPARATOR_LABELS[value],
}));

export const SORT_OPTIONS = Object.values(SortMode).map((value) => ({ value, label: SORT_LABELS[value] }));

export const NODE_FILTER_OPTIONS = Object.values(NodeFilter).map((value) => ({
  value,
  label: NODE_FILTER_LABELS[value],
}));

export const PATH_STYLE_OPTIONS = Object.values(PathStyle).map((value) => ({
  value,
  label: PATH_STYLE_LABELS[value],
}));

export const INDENT_OPTIONS = [
  { value: '2', label: '2 spaces' },
  { value: '4', label: '4 spaces' },
  { value: 'tab', label: 'Tab' },
];

export const NAME_SOURCE_OPTIONS = [
  { value: 'key', label: 'Key name' },
  { value: 'path', label: 'Full path' },
];

export const DEDUPE_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'path', label: 'Path' },
  { value: 'none', label: 'Keep duplicates' },
];
