import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { buildKeyItems } from '@/core/decorate';
import { extractAll } from '@/core/extract';
import { parseDocuments } from '@/core/json-parse';
import { buildSchema } from '@/core/schema';
import { renderFormat } from '@/formats';
import type { GraphModel } from '@/graph/json-to-graph';
import { SAMPLES } from '@/samples';
import type { BuildStats, Field, JsonValue, KeyItem, ParseDiagnostic, SchemaNode } from '@/types';
import { pushHistory, type HistoryEntry } from '@/ui/history';
import { DEFAULT_OPTIONS, NEW_STORAGE_KEY, loadLegacyOptions, loadLegacyTheme, toEngineOptions, type AppOptions } from '@/ui/state';
import { buildTree, pathKeyOf, type TreeNode, type TreeRoot } from '@/ui/tree';

export const LIVE_INPUT_LIMIT = 1_500_000;
export const TREE_FIELD_LIMIT = 4000;
const EMPTY_STATS: BuildStats = { scanned: 0, matched: 0, unique: 0, duplicates: 0, maxDepth: 0 };

export interface AnalysisState {
  docs: JsonValue[];
  fields: Field[];
  tree: TreeRoot | null;
  treeTruncated: boolean;
  treePathCount: number;
  schema: SchemaNode;
  items: KeyItem[];
  stats: BuildStats;
  errors: { include: string | null; exclude: string | null };
  output: string;
  outputError: string | null;
  parseError: ParseDiagnostic | null;
  failedLine?: number;
  format: string | null;
  analysisSource: string | null;
}

export interface AppStore extends AnalysisState {
  input: string;
  compareInput: string;
  options: AppOptions;
  theme: 'light' | 'dark';
  selectedPaths: Set<string> | null;
  collapsedPaths: Set<string>;
  analysisTab: 'tree' | 'graph';
  compareMode: 'union' | 'intersection' | 'only-a' | 'only-b';
  tooLargeForLive: boolean;
  graphModel: GraphModel | null;
  graphSource: string | null;
  sampleIndex: number;
  setInput: (input: string) => void;
  setCompareInput: (input: string) => void;
  setOption: <K extends keyof AppOptions>(key: K, value: AppOptions[K]) => void;
  resetOptions: () => void;
  run: (pushToHistory?: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setAnalysisTab: (tab: 'tree' | 'graph') => void;
  setCompareMode: (mode: AppStore['compareMode']) => void;
  setGraphResult: (model: GraphModel, source: string) => void;
  toggleTreeNode: (node: TreeNode) => void;
  toggleCollapsed: (path: string) => void;
  selectAll: () => void;
  selectNone: () => void;
  selectLeaves: () => void;
  selectMatches: (needle: string) => boolean;
  restoreHistory: (entry: HistoryEntry) => void;
  nextSample: () => string;
  clear: () => void;
}

const emptyAnalysis = (): AnalysisState => ({
  docs: [], fields: [], tree: null, treeTruncated: false, treePathCount: 0,
  schema: buildSchema([]) as SchemaNode, items: [], stats: { ...EMPTY_STATS },
  errors: { include: null, exclude: null }, output: '', outputError: null, parseError: null, format: null, analysisSource: null,
});

function limitedTreeOf(fields: Field[], caseMode: string): { tree: TreeRoot; treeTruncated: boolean; treePathCount: number } {
  const seen = new Set<string>();
  const visible: Field[] = [];
  for (const field of fields) {
    const path = pathKeyOf(field);
    if (seen.has(path)) continue;
    seen.add(path);
    if (visible.length < TREE_FIELD_LIMIT) visible.push(field);
  }
  return {
    tree: buildTree(visible, { caseMode }),
    treeTruncated: seen.size > visible.length,
    treePathCount: seen.size,
  };
}

function collapsedContainersOf(tree: TreeRoot): Set<string> {
  const collapsed = new Set<string>();
  const pending = [...tree.children.values()];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (node.children.size > 0) collapsed.add(node.pathKey);
    pending.push(...node.children.values());
  }
  return collapsed;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      input: '', compareInput: '', options: loadLegacyOptions(), theme: loadLegacyTheme(), selectedPaths: null,
      collapsedPaths: new Set(), analysisTab: 'tree', compareMode: 'union', tooLargeForLive: false,
      graphModel: null, graphSource: null, sampleIndex: 0,
      ...emptyAnalysis(),
      setInput: (input) => {
        const tooLargeForLive = input.length > LIVE_INPUT_LIMIT;
        set(tooLargeForLive
          ? { input, tooLargeForLive, ...emptyAnalysis() }
          : { input, tooLargeForLive });
      },
      setCompareInput: (compareInput) => set({ compareInput }),
      setOption: (key, value) => set((state) => {
        const options = { ...state.options, [key]: value };
        if (key === 'nameSource' && state.options.nameSource !== value && options.dedupeBy !== 'none') {
          options.dedupeBy = value === 'path' ? 'path' : 'name';
        }
        return { options };
      }),
      resetOptions: () => set((state) => ({ options: { ...DEFAULT_OPTIONS, inputMode: state.options.inputMode }, selectedPaths: null, collapsedPaths: new Set() })),
      run: (pushToHistory = true) => {
        const state = get();
        const text = state.input;
        if (!text.trim()) { set({ ...emptyAnalysis() }); return; }
        const parsed = parseDocuments(text, { mode: state.options.inputMode });
        if (!parsed.ok) { set({ ...emptyAnalysis(), analysisSource: text, parseError: parsed.error, failedLine: 'failedLine' in parsed ? parsed.failedLine : undefined }); return; }

        const docs = parsed.docs as JsonValue[];
        const fields = extractAll(docs) as Field[];
        const schema = buildSchema(docs) as SchemaNode;
        const { tree, treeTruncated, treePathCount } = limitedTreeOf(fields, state.options.caseMode);
        const collapsedPaths = treeTruncated && state.analysisSource !== text
          ? collapsedContainersOf(tree)
          : state.collapsedPaths;
        let selectedPaths = state.selectedPaths;
        let selectedIds: Set<number> | null = null;
        if (selectedPaths) {
          selectedIds = new Set(fields.filter((field) => selectedPaths?.has(pathKeyOf(field))).map((field) => field.id));
          if (selectedPaths.size > 0 && fields.length > 0 && selectedIds.size === 0) { selectedPaths = null; selectedIds = null; }
        }
        const engine = toEngineOptions(state.options, selectedIds);
        const built = buildKeyItems(fields, engine) as { items: KeyItem[]; stats: BuildStats; errors: AnalysisState['errors'] };
        const rendered = renderFormat(state.options.formatId, { fields, items: built.items, stats: built.stats, docs, schema, options: engine });
        set({ docs, fields, schema, tree, treeTruncated, treePathCount, collapsedPaths, selectedPaths, items: built.items, stats: built.stats, errors: built.errors,
          output: rendered.text, outputError: rendered.error, parseError: null, failedLine: undefined, format: parsed.format, analysisSource: text });
        if (pushToHistory) pushHistory({ input: text, formatId: state.options.formatId, options: state.options });
      },
      setTheme: (theme) => set({ theme }),
      setAnalysisTab: (analysisTab) => set({ analysisTab }),
      setCompareMode: (compareMode) => set({ compareMode }),
      setGraphResult: (graphModel, graphSource) => set({ graphModel, graphSource }),
      toggleTreeNode: (node) => {
        const state = get();
        const allPaths = state.fields.map(pathKeyOf);
        const selected = state.selectedPaths ? new Set(state.selectedPaths) : new Set(allPaths);
        const fullySelected = node.paths.every((path) => selected.has(path));
        for (const path of node.paths) fullySelected ? selected.delete(path) : selected.add(path);
        set({ selectedPaths: allPaths.every((path) => selected.has(path)) ? null : selected });
      },
      toggleCollapsed: (path) => set((state) => { const next = new Set(state.collapsedPaths); next.has(path) ? next.delete(path) : next.add(path); return { collapsedPaths: next }; }),
      selectAll: () => set({ selectedPaths: null }),
      selectNone: () => set({ selectedPaths: new Set() }),
      selectLeaves: () => set((state) => ({ selectedPaths: new Set(state.fields.filter((field) => field.isLeaf).map(pathKeyOf)) })),
      selectMatches: (needle) => {
        const value = needle.trim().toLowerCase();
        if (!value) return false;
        set((state) => ({ selectedPaths: new Set(state.fields.filter((field) => field.key.toLowerCase().includes(value)).map(pathKeyOf)) }));
        return true;
      },
      restoreHistory: (entry) => set({ input: entry.input, options: { ...get().options, ...entry.options, formatId: entry.formatId }, selectedPaths: null, collapsedPaths: new Set(), tooLargeForLive: false, analysisSource: null }),
      nextSample: () => {
        const index = get().sampleIndex % SAMPLES.length;
        const sample = SAMPLES[index];
        set((state) => ({ input: sample.text, sampleIndex: state.sampleIndex + 1, options: { ...state.options, inputMode: sample.id === 'ndjson' ? 'ndjson' : 'auto' }, tooLargeForLive: false, analysisSource: null }));
        return sample.label;
      },
      clear: () => set({ input: '', compareInput: '', selectedPaths: null, collapsedPaths: new Set(), tooLargeForLive: false, graphModel: null, graphSource: null, ...emptyAnalysis() }),
    }),
    {
      name: NEW_STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ options: state.options, theme: state.theme }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<AppStore>), selectedPaths: null, collapsedPaths: new Set() }),
    },
  ),
);
