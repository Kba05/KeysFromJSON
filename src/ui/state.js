/**
 * Application state: defaults, persistence and the translation from UI options
 * into the pure options the core and the formatters consume.
 *
 * Keeping that translation in one place is what lets the core stay free of DOM
 * concerns and the UI free of generation logic.
 */

import { CaseMode, closingFor } from '../core/naming.js';
import { DEFAULT_SEPARATOR, DedupeBy, NodeFilter, SortMode, NameSource } from '../core/decorate.js';
import { PathStyle } from '../core/keypath.js';
import { DEFAULT_FORMAT_ID } from '../formats/index.js';
import { DEFAULT_WRAPPER_PRESET_ID, wrapperPreset } from './presets.js';

export const STORAGE_KEY = 'kfj.options.v2';
export const THEME_KEY = 'kfj.theme';
export const HISTORY_KEY = 'kfj.history.v2';

/** How much input is kept per history entry; larger payloads are not worth the quota. */
export const HISTORY_INPUT_LIMIT = 60_000;
export const HISTORY_LIMIT = 15;

export const DEFAULT_OPTIONS = {
  inputMode: 'auto',
  formatId: DEFAULT_FORMAT_ID,
  wrapperMode: 'preset',
  wrapperPresetId: DEFAULT_WRAPPER_PRESET_ID,
  wrapperLeft: '"',
  wrapperRight: '"',
  wrapperMirror: true,
  nameSource: NameSource.KEY,
  caseMode: CaseMode.NONE,
  separator: DEFAULT_SEPARATOR,
  sortMode: SortMode.DOCUMENT,
  pathStyle: PathStyle.DOT_BRACKET,
  realIndices: false,
  nodeFilter: NodeFilter.ALL,
  maxDepth: '',
  dedupeBy: DedupeBy.NAME,
  ignoreCase: false,
  search: '',
  includePattern: '',
  excludePattern: '',
  typeName: 'Root',
  indent: '2',
  skeletonTyped: false,
  tsReadonly: false,
  tsExported: true,
  template: '',
  templateHeader: '',
  templateFooter: '',
};

/** Options that are persisted. Everything in DEFAULT_OPTIONS qualifies. */
const PERSISTED_KEYS = Object.keys(DEFAULT_OPTIONS);

/** Read saved options, ignoring anything unknown or corrupted. */
export function loadOptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_OPTIONS };
    for (const key of PERSISTED_KEYS) {
      if (parsed[key] !== undefined) merged[key] = parsed[key];
    }
    return merged;
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

/** Persist options. Storage may be unavailable, which is not worth failing over. */
export function saveOptions(options) {
  try {
    const payload = {};
    for (const key of PERSISTED_KEYS) payload[key] = options[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode or full quota: the tool still works, it just forgets */
  }
}

/**
 * The wrapper characters currently in effect.
 *
 * With mirroring on, a known bracket is *completed* (`[` → `]`) rather than
 * repeated (`[` → `[`), which is what makes the shortcut useful for the wrappers
 * people actually reach for. Characters with no pair mirror as expected.
 */
export function resolveWrapper(options) {
  if (options.wrapperMode === 'custom') {
    const left = options.wrapperLeft ?? '';
    const right = options.wrapperMirror ? closingFor(left) ?? left : options.wrapperRight ?? '';
    return { left, right };
  }
  const preset = wrapperPreset(options.wrapperPresetId);
  return { left: preset.left, right: preset.right };
}

/**
 * Translate UI options into the option object the core and formatters expect.
 *
 * @param {object} options
 * @param {Set<number>|null} selectedIds field ids to keep, or null for everything
 */
export function toEngineOptions(options, selectedIds = null) {
  return {
    // --- core/decorate ------------------------------------------------
    wrap: resolveWrapper(options),
    caseMode: options.caseMode,
    pathStyle: options.pathStyle,
    realIndices: options.realIndices === true,
    nodeFilter: options.nodeFilter,
    maxDepth: options.maxDepth === '' || options.maxDepth === null ? null : Number(options.maxDepth),
    includePattern: options.includePattern,
    excludePattern: options.excludePattern,
    search: options.search,
    selected: selectedIds,
    nameSource: options.nameSource,
    dedupeBy: options.dedupeBy,
    ignoreCase: options.ignoreCase === true,
    sort: options.sortMode,
    separator: options.separator,

    // --- formatters ---------------------------------------------------
    indent: options.indent === 'tab' ? 'tab' : Number(options.indent),
    typeName: options.typeName || 'Root',
    // One UI field drives both the generated type name and the SQL table name, so
    // the SQL formatters read `tableName` while everything else reads `typeName`.
    tableName: options.typeName || 'Root',
    tsReadonly: options.tsReadonly === true,
    tsExported: options.tsExported !== false,
    jsonSkeletonTyped: options.skeletonTyped === true,
    template: options.template || '{{wrapped}}',
    templateHeader: options.templateHeader || '',
    templateFooter: options.templateFooter || '',
  };
}

/** Current theme, preferring the persisted value. */
export function loadTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* fall through to the system preference */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* not worth surfacing */
  }
}
