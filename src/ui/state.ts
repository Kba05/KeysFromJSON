import { DEFAULT_SEPARATOR, DedupeBy, NameSource, NodeFilter, SortMode } from '@/core/decorate';
import { PathStyle } from '@/core/keypath';
import { CaseMode, closingFor } from '@/core/naming';
import { DEFAULT_FORMAT_ID } from '@/formats';
import type { EngineOptions } from '@/types';
import { DEFAULT_WRAPPER_PRESET_ID, wrapperPreset } from '@/ui/presets';

export const STORAGE_KEY = 'kfj.options.v2';
export const NEW_STORAGE_KEY = 'kfj.app.v3';
export const THEME_KEY = 'kfj.theme';
export const HISTORY_KEY = 'kfj.history.v2';
export const HISTORY_INPUT_LIMIT = 60_000;
export const HISTORY_LIMIT = 15;

export interface AppOptions {
  inputMode: 'auto' | 'json' | 'ndjson' | 'relaxed';
  formatId: string;
  wrapperMode: 'preset' | 'custom';
  wrapperPresetId: string;
  wrapperLeft: string;
  wrapperRight: string;
  wrapperMirror: boolean;
  nameSource: string;
  caseMode: string;
  separator: string;
  sortMode: string;
  pathStyle: string;
  realIndices: boolean;
  nodeFilter: string;
  maxDepth: string;
  dedupeBy: string;
  ignoreCase: boolean;
  search: string;
  includePattern: string;
  excludePattern: string;
  typeName: string;
  indent: string;
  skeletonTyped: boolean;
  tsReadonly: boolean;
  tsExported: boolean;
  template: string;
  templateHeader: string;
  templateFooter: string;
}

export const DEFAULT_OPTIONS: AppOptions = {
  inputMode: 'auto', formatId: DEFAULT_FORMAT_ID, wrapperMode: 'preset', wrapperPresetId: DEFAULT_WRAPPER_PRESET_ID,
  wrapperLeft: '"', wrapperRight: '"', wrapperMirror: true, nameSource: NameSource.KEY, caseMode: CaseMode.NONE,
  separator: DEFAULT_SEPARATOR, sortMode: SortMode.DOCUMENT, pathStyle: PathStyle.DOT_BRACKET, realIndices: false,
  nodeFilter: NodeFilter.ALL, maxDepth: '', dedupeBy: DedupeBy.NAME, ignoreCase: false, search: '',
  includePattern: '', excludePattern: '', typeName: 'Root', indent: '2', skeletonTyped: false, tsReadonly: false,
  tsExported: true, template: '', templateHeader: '', templateFooter: '',
};

export function loadLegacyOptions(): AppOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<AppOptions>;
    const merged = { ...DEFAULT_OPTIONS };
    for (const key of Object.keys(DEFAULT_OPTIONS) as Array<keyof AppOptions>) {
      if (parsed[key] !== undefined) (merged[key] as unknown) = parsed[key];
    }
    return merged;
  } catch { return { ...DEFAULT_OPTIONS }; }
}

export function loadLegacyTheme(): 'light' | 'dark' {
  try { const value = localStorage.getItem(THEME_KEY); if (value === 'light' || value === 'dark') return value; } catch { /* ignored */ }
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveWrapper(options: AppOptions): { left: string; right: string } {
  if (options.wrapperMode === 'custom') {
    const right = options.wrapperMirror ? closingFor(options.wrapperLeft) ?? options.wrapperLeft : options.wrapperRight;
    return { left: options.wrapperLeft, right };
  }
  const preset = wrapperPreset(options.wrapperPresetId);
  return { left: preset.left, right: preset.right };
}

export function toEngineOptions(options: AppOptions, selected: Set<number> | null = null): EngineOptions {
  return {
    wrap: resolveWrapper(options), caseMode: options.caseMode, pathStyle: options.pathStyle, realIndices: options.realIndices,
    nodeFilter: options.nodeFilter, maxDepth: options.maxDepth === '' ? null : Number(options.maxDepth),
    includePattern: options.includePattern, excludePattern: options.excludePattern, search: options.search, selected,
    nameSource: options.nameSource, dedupeBy: options.dedupeBy, ignoreCase: options.ignoreCase, sort: options.sortMode,
    separator: options.separator, indent: options.indent === 'tab' ? 'tab' : Number(options.indent),
    typeName: options.typeName || 'Root', tableName: options.typeName || 'Root', tsReadonly: options.tsReadonly,
    tsExported: options.tsExported, jsonSkeletonTyped: options.skeletonTyped, template: options.template || '{{wrapped}}',
    templateHeader: options.templateHeader, templateFooter: options.templateFooter,
  };
}
