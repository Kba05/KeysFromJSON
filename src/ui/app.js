/**
 * Application controller.
 *
 * Wires the DOM to the pure core. Everything interesting — parsing, extraction,
 * schema merging, formatting — lives in `src/core` and `src/formats`; this file
 * owns only state, events and rendering.
 *
 * Rendering runs on a trailing debounce as you type, because the tool is far more
 * useful when it updates live than when it waits for a button. For inputs past
 * `LIVE_INPUT_LIMIT` automatic rendering is suspended and the status bar asks for
 * an explicit run, so one big paste cannot lock the tab.
 */

import Modal from 'bootstrap/js/dist/modal.js';
// Imported for its data-api side effect: the header dropdown and the modal are
// driven entirely by `data-bs-*` attributes in the markup.
import 'bootstrap/js/dist/dropdown.js';

import { parseDocuments, repairJson, stringifyJson } from '../core/json-parse.js';
import { extractAll } from '../core/extract.js';
import { buildSchema } from '../core/schema.js';
import { buildKeyItems } from '../core/decorate.js';
import { PATH_STYLE_EXAMPLES } from '../core/keypath.js';
import { getFormatter, groupedFormatters, renderFormat } from '../formats/index.js';
import { SUMMARY_TOKENS, TEMPLATE_TOKENS } from '../formats/template.js';
import { SAMPLES } from '../samples.js';
import { byId, create, debounce, fillSelect, relativeTime, renderStats, replace } from './dom.js';
import { COMPARE_MODES, comparePathSets, pathSetOf, renderComparison } from './diff.js';
import { attachDropZone, downloadText, filesToText, suggestedFilename } from './files.js';
import { clearHistory, loadHistory, pushHistory } from './history.js';
import {
  CASE_OPTIONS,
  DEDUPE_OPTIONS,
  INDENT_OPTIONS,
  NAME_SOURCE_OPTIONS,
  NODE_FILTER_OPTIONS,
  PATH_STYLE_OPTIONS,
  SEPARATOR_OPTIONS,
  SORT_OPTIONS,
  WRAPPER_PRESETS,
} from './presets.js';
import { buildShareUrl, clearLocationState, readLocationState } from './share.js';
import {
  DEFAULT_OPTIONS,
  loadOptions,
  loadTheme,
  resolveWrapper,
  saveOptions,
  saveTheme,
  toEngineOptions,
} from './state.js';
import { copyWithFeedback, toast } from './toast.js';
import { buildTree, pathKeyOf, renderTree } from './tree.js';

/** Above this many characters, typing no longer re-renders automatically. */
const LIVE_INPUT_LIMIT = 1_500_000;
/** Above this many keys, the tree is skipped: it would cost more than it gives. */
const TREE_FIELD_LIMIT = 4000;
const RUN_DEBOUNCE_MS = 160;

const els = {
  jsonInput: byId('jsonInput'),
  inputMode: byId('inputMode'),
  formatJsonBtn: byId('formatJsonBtn'),
  minifyBtn: byId('minifyBtn'),
  sampleBtn: byId('sampleBtn'),
  openFileBtn: byId('openFileBtn'),
  clearBtn: byId('clearBtn'),
  dropZone: byId('dropZone'),
  inputStats: byId('inputStats'),

  errorBanner: byId('errorBanner'),
  errorTitle: byId('errorTitle'),
  errorLocation: byId('errorLocation'),
  errorSnippet: byId('errorSnippet'),
  repairBtn: byId('repairBtn'),

  formatSelect: byId('formatSelect'),
  formatHint: byId('formatHint'),
  output: byId('output'),
  outputStats: byId('outputStats'),
  copyBtn: byId('copyBtn'),
  downloadBtn: byId('downloadBtn'),
  shareBtn: byId('shareBtn'),

  resetOptionsBtn: byId('resetOptionsBtn'),
  wrapperPresetRadio: byId('wrapperPresetRadio'),
  wrapperCustomRadio: byId('wrapperCustomRadio'),
  wrapperPreset: byId('wrapperPreset'),
  wrapperLeft: byId('wrapperLeft'),
  wrapperRight: byId('wrapperRight'),
  wrapperMirror: byId('wrapperMirror'),
  nameSource: byId('nameSource'),
  caseMode: byId('caseMode'),
  separator: byId('separator'),
  sortMode: byId('sortMode'),
  pathStyle: byId('pathStyle'),
  pathExample: byId('pathExample'),
  realIndices: byId('realIndices'),
  nodeFilter: byId('nodeFilter'),
  maxDepth: byId('maxDepth'),
  dedupeBy: byId('dedupeBy'),
  ignoreCase: byId('ignoreCase'),
  search: byId('search'),
  includePattern: byId('includePattern'),
  includeError: byId('includeError'),
  excludePattern: byId('excludePattern'),
  excludeError: byId('excludeError'),
  typeName: byId('typeName'),
  indent: byId('indent'),
  skeletonTyped: byId('skeletonTyped'),
  tsReadonly: byId('tsReadonly'),
  tsExported: byId('tsExported'),

  templateEditor: byId('templateEditor'),
  template: byId('template'),
  templateHeader: byId('templateHeader'),
  templateFooter: byId('templateFooter'),
  summaryTokens: byId('summaryTokens'),
  keyTokens: byId('keyTokens'),

  treeHost: byId('treeHost'),
  treeSearch: byId('treeSearch'),
  treeAllBtn: byId('treeAllBtn'),
  treeNoneBtn: byId('treeNoneBtn'),
  treeLeavesBtn: byId('treeLeavesBtn'),
  treeMatchBtn: byId('treeMatchBtn'),
  selectionBadge: byId('selectionBadge'),

  compareInput: byId('compareInput'),
  compareOutput: byId('compareOutput'),
  compareFromOutputBtn: byId('compareFromOutputBtn'),
  compareCopyBtn: byId('compareCopyBtn'),

  historyMenu: byId('historyMenu'),
  themeToggle: byId('themeToggle'),
  themeIcon: byId('themeIcon'),
  fileInput: byId('fileInput'),
};

const state = {
  docs: [],
  fields: [],
  tree: null,
  schema: buildSchema([]),
  items: [],
  stats: { scanned: 0, matched: 0, unique: 0, duplicates: 0, maxDepth: 0 },
  errors: { include: null, exclude: null },
  output: '',
  outputError: null,
  format: null,
  tooLargeForLive: false,
  sampleIndex: 0,
};

/** Options loaded from storage, then overwritten by any shared link. */
let options = loadOptions();
/** `null` means "every key"; otherwise a set of path keys. */
let selectedPaths = null;
/** Collapsed branches, keyed by path so they survive edits. */
const collapsedPaths = new Set();
let compareMode = COMPARE_MODES.UNION;
let shortcutsModal = null;

/* ------------------------------------------------------------------ *
 * Option plumbing
 * ------------------------------------------------------------------ */

const scheduleRun = debounce(() => run(), RUN_DEBOUNCE_MS);

/** Save, then re-render. Every option change funnels through here. */
function commit() {
  saveOptions(options);
  scheduleRun();
}

const TEXT_CONTROLS = [
  ['nameSource', 'nameSource'],
  ['caseMode', 'caseMode'],
  ['separator', 'separator'],
  ['sortMode', 'sortMode'],
  ['pathStyle', 'pathStyle'],
  ['nodeFilter', 'nodeFilter'],
  ['dedupeBy', 'dedupeBy'],
  ['indent', 'indent'],
  ['maxDepth', 'maxDepth'],
  ['search', 'search'],
  ['includePattern', 'includePattern'],
  ['excludePattern', 'excludePattern'],
  ['typeName', 'typeName'],
  ['template', 'template'],
  ['templateHeader', 'templateHeader'],
  ['templateFooter', 'templateFooter'],
];

const CHECK_CONTROLS = [
  ['realIndices', 'realIndices'],
  ['ignoreCase', 'ignoreCase'],
  ['skeletonTyped', 'skeletonTyped'],
  ['tsReadonly', 'tsReadonly'],
  ['tsExported', 'tsExported'],
];

function fillOptionSelects() {
  fillSelect(els.wrapperPreset, WRAPPER_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })));
  fillSelect(els.caseMode, CASE_OPTIONS);
  fillSelect(els.separator, SEPARATOR_OPTIONS);
  fillSelect(els.sortMode, SORT_OPTIONS);
  fillSelect(els.pathStyle, PATH_STYLE_OPTIONS);
  fillSelect(els.indent, INDENT_OPTIONS);
  fillSelect(els.nameSource, NAME_SOURCE_OPTIONS);
  fillSelect(els.dedupeBy, DEDUPE_OPTIONS);
  fillSelect(els.nodeFilter, NODE_FILTER_OPTIONS);

  const groups = groupedFormatters();
  els.formatSelect.replaceChildren(
    ...groups.map((group) =>
      create(
        'optgroup',
        { label: group.label },
        group.formatters.map((formatter) =>
          create('option', { value: formatter.id, text: formatter.label, title: formatter.hint }),
        ),
      ),
    ),
  );
}

function syncControls() {
  els.inputMode.value = options.inputMode;
  els.formatSelect.value = options.formatId;

  els.wrapperPresetRadio.checked = options.wrapperMode === 'preset';
  els.wrapperCustomRadio.checked = options.wrapperMode === 'custom';
  els.wrapperPreset.value = options.wrapperPresetId;
  els.wrapperLeft.value = options.wrapperLeft;
  els.wrapperRight.value = options.wrapperRight;
  els.wrapperMirror.checked = options.wrapperMirror;

  for (const [id, key] of TEXT_CONTROLS) els[id].value = options[key] ?? '';
  for (const [id, key] of CHECK_CONTROLS) els[id].checked = options[key] === true;

  syncWrapperAvailability();
  syncPathExample();
  syncTemplateEditor();
}

function syncWrapperAvailability() {
  const custom = options.wrapperMode === 'custom';
  els.wrapperPreset.disabled = custom;
  els.wrapperLeft.disabled = !custom;
  els.wrapperRight.disabled = !custom || options.wrapperMirror;
  // Show what will actually be emitted, including a completed bracket.
  els.wrapperRight.value = options.wrapperMirror ? resolveWrapper(options).right : options.wrapperRight;
}

function syncPathExample() {
  els.pathExample.textContent = PATH_STYLE_EXAMPLES[options.pathStyle] ?? '';
}

/**
 * Keep name de-duplication in step with the name source.
 *
 * Printing paths while de-duplicating by key name silently drops distinct paths —
 * `b.id` disappears because `a.id` got there first — which is never what the
 * person switching to path output wanted. An explicit "keep duplicates" choice is
 * left alone, and both controls stay manually overridable.
 */
function syncDedupeToNameSource(previousNameSource) {
  if (previousNameSource === options.nameSource) return;
  if (options.dedupeBy === 'none') return;
  options.dedupeBy = options.nameSource === 'path' ? 'path' : 'name';
  els.dedupeBy.value = options.dedupeBy;
}

/** Show the token chips only for the formats that use a template. */
function syncTemplateEditor() {
  const usesTemplate = options.formatId === 'custom-template' || options.formatId === 'template-list';
  els.templateEditor.hidden = !usesTemplate;
  if (!usesTemplate) return;
  if (els.keyTokens.childElementCount === 0) {
    els.keyTokens.replaceChildren(...TEMPLATE_TOKENS.map((token) => tokenChip(token, els.template)));
    els.summaryTokens.replaceChildren(...SUMMARY_TOKENS.map((token) => tokenChip(token, els.templateHeader)));
  }
}

/** A clickable `{{token}}` chip that appends itself to the given textarea. */
function tokenChip(token, target) {
  const chip = create('button', {
    class: 'token-chip',
    type: 'button',
    text: `{{${token.token}}}`,
    title: token.description,
  });
  chip.addEventListener('click', () => {
    const insertion = `{{${token.token}}}`;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.value = `${target.value.slice(0, start)}${insertion}${target.value.slice(end)}`;
    target.focus();
    target.setSelectionRange(start + insertion.length, start + insertion.length);
    options[target === els.template ? 'template' : target === els.templateHeader ? 'templateHeader' : 'templateFooter'] =
      target.value;
    commit();
  });
  return chip;
}

function bindControls() {
  els.inputMode.addEventListener('change', () => {
    options.inputMode = els.inputMode.value;
    commit();
  });

  els.formatSelect.addEventListener('change', () => {
    options.formatId = els.formatSelect.value;
    syncTemplateEditor();
    commit();
  });

  for (const [id, key] of TEXT_CONTROLS) {
    els[id].addEventListener('input', () => {
      const previous = options[key];
      options[key] = els[id].value;
      if (key === 'nameSource') syncDedupeToNameSource(previous);
      if (key === 'pathStyle') syncPathExample();
      commit();
    });
  }

  for (const [id, key] of CHECK_CONTROLS) {
    els[id].addEventListener('change', () => {
      options[key] = els[id].checked;
      commit();
    });
  }

  // Wrapper controls -------------------------------------------------------
  els.wrapperPresetRadio.addEventListener('change', () => {
    options.wrapperMode = 'preset';
    syncWrapperAvailability();
    commit();
  });

  els.wrapperCustomRadio.addEventListener('change', () => {
    options.wrapperMode = 'custom';
    // Seed the custom fields from the preset so the switch is not destructive.
    if (options.wrapperLeft === '' && options.wrapperRight === '') {
      const preset = resolveWrapper({ ...options, wrapperMode: 'preset' });
      options.wrapperLeft = preset.left;
      options.wrapperRight = preset.right;
    }
    syncWrapperAvailability();
    commit();
  });

  els.wrapperPreset.addEventListener('change', () => {
    options.wrapperPresetId = els.wrapperPreset.value;
    commit();
  });

  els.wrapperLeft.addEventListener('input', () => {
    options.wrapperLeft = els.wrapperLeft.value;
    if (options.wrapperMirror) {
      // Keep the disabled right-hand box showing the resolved counterpart.
      options.wrapperRight = resolveWrapper({ ...options, wrapperRight: undefined }).right;
      els.wrapperRight.value = options.wrapperRight;
    }
    commit();
  });

  els.wrapperRight.addEventListener('input', () => {
    options.wrapperRight = els.wrapperRight.value;
    commit();
  });

  els.wrapperMirror.addEventListener('change', () => {
    options.wrapperMirror = els.wrapperMirror.checked;
    syncWrapperAvailability();
    commit();
  });

  els.resetOptionsBtn.addEventListener('click', () => {
    options = { ...DEFAULT_OPTIONS, inputMode: options.inputMode };
    selectedPaths = null;
    collapsedPaths.clear();
    syncControls();
    saveOptions(options);
    run();
    toast('Options reset to defaults', { variant: 'info' });
  });
}

/* ------------------------------------------------------------------ *
 * Input actions
 * ------------------------------------------------------------------ */

function setInput(text, { silent = false } = {}) {
  els.jsonInput.value = text;
  if (!silent) run();
}

function formatInput() {
  const parsed = parseDocuments(els.jsonInput.value, { mode: options.inputMode });
  if (!parsed.ok) {
    if (parsed.error.repairable) {
      els.repairBtn.hidden = false;
      toast(`${parsed.error.message} — press Repair to fix it`, { variant: 'warning', delay: 3200 });
    } else {
      toast(`Cannot format: ${parsed.error.message}`, { variant: 'danger' });
    }
    return;
  }
  const indent = options.indent === 'tab' ? '\t' : Number(options.indent);
  const text = parsed.docs.length === 1
    ? stringifyJson(parsed.docs[0], indent)
    : parsed.docs.map((doc) => stringifyJson(doc, indent)).join('\n');
  setInput(text);
  toast('Input formatted', { variant: 'success', delay: 1400 });
}

function minifyInput() {
  const parsed = parseDocuments(els.jsonInput.value, { mode: options.inputMode });
  if (!parsed.ok) {
    toast(`Cannot minify: ${parsed.error.message}`, { variant: 'danger' });
    return;
  }
  setInput(parsed.docs.map((doc) => JSON.stringify(doc)).join('\n'));
  toast('Input minified', { variant: 'success', delay: 1400 });
}

function repairInput() {
  const result = repairJson(els.jsonInput.value, options.indent === 'tab' ? 2 : Number(options.indent));
  if (!result.ok) {
    toast(`Could not repair: ${result.error.message}`, { variant: 'danger' });
    return;
  }
  setInput(result.text);
  toast('JSON repaired', { variant: 'success' });
}

function loadNextSample() {
  const sample = SAMPLES[state.sampleIndex % SAMPLES.length];
  state.sampleIndex += 1;
  setInput(sample.text);
  els.inputMode.value = sample.id === 'ndjson' ? 'ndjson' : 'auto';
  options.inputMode = els.inputMode.value;
  saveOptions(options);
  toast(`${sample.label} — ${sample.note}`, { variant: 'info', delay: 3000 });
}

function clearAll() {
  els.jsonInput.value = '';
  els.compareInput.value = '';
  els.output.textContent = '';
  selectedPaths = null;
  collapsedPaths.clear();
  historyPushSkip = true;
  run();
  els.jsonInput.focus();
}

async function openFiles(files) {
  const result = await filesToText(files);
  if (result.error) {
    toast(`Could not read the file: ${result.error}`, { variant: 'danger' });
    return;
  }
  setInput(result.text);
  toast(
    result.names.length === 1
      ? `Loaded ${result.names[0]}`
      : `Loaded ${result.names.length} files as JSON Lines`,
    { variant: 'success' },
  );
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function hideError() {
  els.errorBanner.hidden = true;
  els.repairBtn.hidden = true;
}

function showError(error, failedLine) {
  els.errorTitle.textContent = error.message;
  const parts = [`Line ${error.line}, column ${error.column}`];
  if (failedLine) parts.push(`NDJSON line ${failedLine}`);
  els.errorLocation.textContent = parts.join(' · ');
  els.errorSnippet.textContent = `${error.snippet}\n${error.caret}`;
  els.repairBtn.hidden = !error.repairable;
  els.errorBanner.hidden = false;
}

function renderOutput() {
  els.output.textContent = state.output;
  const formatter = getFormatter(options.formatId);
  els.formatHint.textContent = formatter ? formatter.hint : '';
}

function renderStatsPanels() {
  const text = els.jsonInput.value;
  const chars = text.length;
  const lines = text ? text.split('\n').length : 0;

  const inputEntries = [{ text: `${chars.toLocaleString()} characters` }];
  if (lines > 1) inputEntries.push({ text: `${lines.toLocaleString()} lines` });
  if (state.format === 'ndjson') inputEntries.push({ text: 'NDJSON' });
  if (state.docs.length > 1) inputEntries.push({ text: `${state.docs.length} documents` });
  if (state.fields.length > 0) {
    inputEntries.push({ text: `${state.fields.length.toLocaleString()} keys` });
    inputEntries.push({ text: `max depth ${state.stats.maxDepth}` });
  }
  if (state.tooLargeForLive) {
    inputEntries.push({ text: 'live rendering paused — press Ctrl+Enter', warn: true });
  }
  renderStats(els.inputStats, inputEntries);

  const outputEntries = [];
  const formatter = getFormatter(options.formatId);
  if (formatter) outputEntries.push({ text: formatter.label });
  if (state.stats.scanned > 0) {
    outputEntries.push({ text: `${state.stats.unique.toLocaleString()} in output` });
    if (state.stats.duplicates > 0) {
      outputEntries.push({ text: `${state.stats.duplicates.toLocaleString()} duplicates removed` });
    }
    if (state.stats.matched !== state.stats.scanned) {
      outputEntries.push({
        text: `${state.stats.matched.toLocaleString()} of ${state.stats.scanned.toLocaleString()} matched filters`,
      });
    }
  }
  if (state.outputError) outputEntries.push({ text: state.outputError, warn: true });
  if (state.stats.maxDepth >= 12) {
    outputEntries.push({ text: `deep nesting (${state.stats.maxDepth}) — check the output`, warn: true });
  }
  // Column-oriented formats drop container keys, so say so rather than letting the
  // entry count look wrong.
  if (formatter?.leafOnly && options.nodeFilter !== 'leaf') {
    outputEntries.push({ text: 'leaf keys only' });
  }
  renderStats(els.outputStats, outputEntries);

  els.includeError.hidden = !state.errors.include;
  els.includeError.textContent = state.errors.include ? `Invalid regex: ${state.errors.include}` : '';
  els.excludeError.hidden = !state.errors.exclude;
  els.excludeError.textContent = state.errors.exclude ? `Invalid regex: ${state.errors.exclude}` : '';
}

function renderTreePanel() {
  const needle = els.treeSearch.value;
  if (state.fields.length === 0) {
    replace(els.treeHost, create('div', { class: 'tree-empty', text: 'Paste JSON to see its keys here.' }));
  } else if (!state.tree) {
    replace(
      els.treeHost,
      create('div', {
        class: 'tree-empty',
        text: `The document has more than ${TREE_FIELD_LIMIT.toLocaleString()} keys, so the tree is hidden. Filters above still apply.`,
      }),
    );
  } else {
    replace(els.treeHost, renderTree(state.tree, { selectedPaths, collapsed: collapsedPaths, search: needle }));
  }

  if (selectedPaths) {
    els.selectionBadge.textContent = `${selectedPaths.size.toLocaleString()} paths selected`;
    els.selectionBadge.className = 'badge text-bg-primary';
  } else {
    els.selectionBadge.textContent = 'all keys';
    els.selectionBadge.className = 'badge text-bg-secondary';
  }
}

function renderCompare() {
  const compareText = els.compareInput.value;
  if (!compareText.trim()) {
    els.compareOutput.textContent =
      'Paste a second document to see the union, the shared keys and the differences.';
    return;
  }
  if (state.docs.length === 0) {
    els.compareOutput.textContent = 'The first document does not parse yet, so there is nothing to compare.';
    return;
  }

  const parsedB = parseDocuments(compareText, { mode: options.inputMode });
  if (!parsedB.ok) {
    els.compareOutput.textContent = `The second document does not parse: ${parsedB.error.message} (line ${parsedB.error.line}, column ${parsedB.error.column})`;
    return;
  }

  const pathOptions = { pathStyle: options.pathStyle, realIndices: options.realIndices };
  const setA = new Set();
  for (const doc of state.docs) for (const path of pathSetOf(doc, pathOptions)) setA.add(path);
  const setB = new Set();
  for (const doc of parsedB.docs) for (const path of pathSetOf(doc, pathOptions)) setB.add(path);

  els.compareOutput.textContent = renderComparison(comparePathSets(setA, setB, compareMode), compareMode);
}

/* ------------------------------------------------------------------ *
 * The run loop
 * ------------------------------------------------------------------ */

function resetDerived() {
  state.docs = [];
  state.fields = [];
  state.tree = null;
  state.schema = buildSchema([]);
  state.items = [];
  state.stats = { scanned: 0, matched: 0, unique: 0, duplicates: 0, maxDepth: 0 };
  state.errors = { include: null, exclude: null };
  state.output = '';
  state.outputError = null;
  state.format = null;
}

/** Field ids for the current selection, or null when everything is selected. */
function selectedIdsFromPaths() {
  if (!selectedPaths) return null;
  const ids = new Set();
  for (const field of state.fields) {
    if (selectedPaths.has(pathKeyOf(field))) ids.add(field.id);
  }
  return ids;
}

let historyPushSkip = false;

function run() {
  const text = els.jsonInput.value ?? '';

  if (!text.trim()) {
    resetDerived();
    hideError();
    renderOutput();
    renderStatsPanels();
    renderTreePanel();
    renderCompare();
    return;
  }

  const parsed = parseDocuments(text, { mode: options.inputMode });

  if (!parsed.ok) {
    resetDerived();
    showError(parsed.error, parsed.failedLine);
    renderOutput();
    renderStatsPanels();
    renderTreePanel();
    renderCompare();
    return;
  }

  hideError();
  state.docs = parsed.docs;
  state.format = parsed.format;
  state.fields = extractAll(parsed.docs);
  state.schema = buildSchema(parsed.docs);
  state.tree = state.fields.length <= TREE_FIELD_LIMIT ? buildTree(state.fields, { caseMode: options.caseMode }) : null;

  // A selection carried over from a previous document can match nothing here —
  // pasting unrelated JSON after trimming the tree, for instance. Rendering an
  // empty output with no explanation would look like the tool had broken, so fall
  // back to every key. An explicit "None" is a selection of size zero and is left
  // alone, because that one is deliberate.
  let selectedIds = selectedIdsFromPaths();
  if (selectedPaths && selectedPaths.size > 0 && state.fields.length > 0 && selectedIds?.size === 0) {
    selectedPaths = null;
    selectedIds = null;
    toast('The previous key selection does not match this document — showing all keys', {
      variant: 'warning',
      delay: 3200,
    });
  }

  const engine = toEngineOptions(options, selectedIds);
  const built = buildKeyItems(state.fields, engine);
  state.items = built.items;
  state.stats = built.stats;
  state.errors = built.errors;

  const rendered = renderFormat(options.formatId, {
    fields: state.fields,
    items: state.items,
    stats: state.stats,
    docs: state.docs,
    schema: state.schema,
    options: engine,
  });
  state.output = rendered.text;
  state.outputError = rendered.error;

  renderOutput();
  renderStatsPanels();
  renderTreePanel();
  renderCompare();

  if (historyPushSkip) {
    historyPushSkip = false;
  } else {
    renderHistory(pushHistory({ input: text, formatId: options.formatId, options }));
  }
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function renderHistory(entries = loadHistory()) {
  if (entries.length === 0) {
    replace(
      els.historyMenu,
      create('li', {}, create('span', { class: 'dropdown-item-text text-body-secondary small', text: 'Nothing saved yet' })),
    );
    return;
  }

  const items = entries.map((entry) =>
    create('li', {}, [
      create(
        'button',
        {
          class: 'dropdown-item',
          type: 'button',
          dataset: { historyAt: String(entry.at) },
        },
        [
          create('span', { class: 'history-item', text: `${entry.formatId} · ${relativeTime(entry.at)}` }),
          create('span', { class: 'history-preview', text: entry.input.replace(/\s+/g, ' ').slice(0, 90) }),
        ],
      ),
    ]),
  );

  items.push(create('li', {}, create('hr', { class: 'dropdown-divider' })));
  items.push(
    create('li', {}, create('button', { class: 'dropdown-item text-danger', type: 'button', id: 'clearHistoryBtn', text: 'Clear history' })),
  );

  replace(els.historyMenu, items);
}

/* ------------------------------------------------------------------ *
 * Tree interaction
 * ------------------------------------------------------------------ */

function bindTree() {
  els.treeHost.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-node]');
    if (!input || !state.tree) return;
    const node = state.tree.nodes.get(Number(input.dataset.node));
    if (!node) return;

    const all = !selectedPaths;
    const fullySelected = all || node.paths.every((path) => selectedPaths.has(path));

    if (!selectedPaths) selectedPaths = new Set(state.fields.map(pathKeyOf));

    if (fullySelected) {
      for (const path of node.paths) selectedPaths.delete(path);
    } else {
      for (const path of node.paths) selectedPaths.add(path);
    }

    // Back to "everything" as soon as nothing is excluded: keeps the fast path.
    if (state.fields.every((field) => selectedPaths.has(pathKeyOf(field)))) selectedPaths = null;

    scheduleRun();
  });

  els.treeHost.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-collapse]');
    if (!button) return;
    const key = button.dataset.collapse;
    if (collapsedPaths.has(key)) collapsedPaths.delete(key);
    else collapsedPaths.add(key);
    renderTreePanel();
  });

  els.treeSearch.addEventListener('input', debounce(() => renderTreePanel(), 120));

  els.treeAllBtn.addEventListener('click', () => {
    selectedPaths = null;
    scheduleRun();
  });

  els.treeNoneBtn.addEventListener('click', () => {
    selectedPaths = new Set();
    scheduleRun();
  });

  els.treeLeavesBtn.addEventListener('click', () => {
    selectedPaths = new Set(state.fields.filter((field) => field.isLeaf).map(pathKeyOf));
    scheduleRun();
  });

  els.treeMatchBtn.addEventListener('click', () => {
    const needle = els.treeSearch.value.trim().toLowerCase();
    if (!needle) {
      toast('Type something in the tree filter first', { variant: 'warning' });
      return;
    }
    selectedPaths = new Set(
      state.fields.filter((field) => field.key.toLowerCase().includes(needle)).map(pathKeyOf),
    );
    scheduleRun();
  });
}

/* ------------------------------------------------------------------ *
 * Compare interaction
 * ------------------------------------------------------------------ */

function bindCompare() {
  const recompute = debounce(() => renderCompare(), 150);
  els.compareInput.addEventListener('input', recompute);

  for (const button of document.querySelectorAll('[data-compare]')) {
    button.addEventListener('click', () => {
      compareMode = button.dataset.compare;
      for (const other of document.querySelectorAll('[data-compare]')) {
        other.classList.toggle('btn-secondary', other === button);
        other.classList.toggle('btn-outline-secondary', other !== button);
      }
      renderCompare();
    });
  }

  // Mark the default mode on first paint.
  const initial = document.querySelector('[data-compare="union"]');
  if (initial) {
    initial.classList.add('btn-secondary');
    initial.classList.remove('btn-outline-secondary');
  }

  els.compareFromOutputBtn.addEventListener('click', () => {
    els.compareInput.value = els.jsonInput.value;
    renderCompare();
  });

  els.compareCopyBtn.addEventListener('click', () => copyWithFeedback(els.compareOutput.textContent, 'Comparison'));
}

/* ------------------------------------------------------------------ *
 * Clipboard, files, links
 * ------------------------------------------------------------------ */

function bindActions() {
  els.copyBtn.addEventListener('click', () => copyWithFeedback(state.output, 'Output'));

  els.downloadBtn.addEventListener('click', () => {
    if (!state.output) {
      toast('Nothing to save yet', { variant: 'warning' });
      return;
    }
    downloadText(suggestedFilename(options.formatId, options.typeName), state.output);
  });

  els.shareBtn.addEventListener('click', async () => {
    const { url, error } = await buildShareUrl({ input: els.jsonInput.value, options, formatId: options.formatId });
    if (error) {
      toast(error, { variant: 'danger', delay: 4000 });
      return;
    }
    window.history.replaceState(null, '', url);
    await copyWithFeedback(url, 'Link');
  });

  els.formatJsonBtn.addEventListener('click', formatInput);
  els.minifyBtn.addEventListener('click', minifyInput);
  els.repairBtn.addEventListener('click', repairInput);
  els.sampleBtn.addEventListener('click', loadNextSample);
  els.clearBtn.addEventListener('click', clearAll);

  els.openFileBtn.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files?.length) openFiles(els.fileInput.files);
    els.fileInput.value = '';
  });

  attachDropZone(els.dropZone, (files) => {
    openFiles(files);
  });

  els.historyMenu.addEventListener('click', (event) => {
    const clearButton = event.target.closest('#clearHistoryBtn');
    if (clearButton) {
      renderHistory(clearHistory());
      toast('History cleared', { variant: 'info' });
      return;
    }

    const button = event.target.closest('[data-history-at]');
    if (!button) return;
    const entry = loadHistory().find((item) => String(item.at) === button.dataset.historyAt);
    if (!entry) return;

    els.jsonInput.value = entry.input;
    options = { ...options, ...entry.options, formatId: entry.formatId };
    selectedPaths = null;
    collapsedPaths.clear();
    syncControls();
    saveOptions(options);
    run();
    toast('Restored from history', { variant: 'success' });
  });
}

/* ------------------------------------------------------------------ *
 * Theme and shortcuts
 * ------------------------------------------------------------------ */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
  els.themeIcon.textContent = theme === 'dark' ? '☾' : '☀';
  saveTheme(theme);
}

function bindTheme() {
  applyTheme(loadTheme());
  els.themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
}

function bindShortcuts() {
  window.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLowerCase();

    if (key === 'k' && !event.shiftKey) {
      event.preventDefault();
      els.jsonInput.focus();
      els.jsonInput.select();
      return;
    }
    if (key === 'enter') {
      event.preventDefault();
      run();
      return;
    }
    if (key === 'c' && event.shiftKey) {
      event.preventDefault();
      copyWithFeedback(state.output, 'Output');
      return;
    }
    if (key === 'f' && event.shiftKey) {
      event.preventDefault();
      formatInput();
      return;
    }
    if (key === 'k' && event.shiftKey) {
      event.preventDefault();
      clearAll();
      return;
    }
    if (key === '/') {
      event.preventDefault();
      shortcutsModal?.show();
    }
  });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function applySharedState() {
  const { payload, error } = await readLocationState();
  if (error) {
    toast(error, { variant: 'danger', delay: 5000 });
    return false;
  }
  if (!payload) return false;

  if (typeof payload.input === 'string') els.jsonInput.value = payload.input;
  if (payload.options && typeof payload.options === 'object') {
    options = { ...options, ...payload.options };
  }
  if (typeof payload.formatId === 'string') options.formatId = payload.formatId;
  syncControls();
  saveOptions(options);
  toast('Restored from the shared link', { variant: 'info', delay: 3000 });
  return true;
}

export async function start() {
  fillOptionSelects();
  syncControls();
  bindControls();
  bindActions();
  bindTree();
  bindCompare();
  bindTheme();
  bindShortcuts();

  shortcutsModal = Modal.getOrCreateInstance(byId('shortcutsModal'));

  els.jsonInput.addEventListener('input', () => {
    if (els.jsonInput.value.length > LIVE_INPUT_LIMIT) {
      state.tooLargeForLive = true;
      renderStatsPanels();
      return;
    }
    state.tooLargeForLive = false;
    scheduleRun();
  });

  const restored = await applySharedState();
  const history = loadHistory();
  renderHistory(history);

  if (!restored && history.length === 0) {
    // First visit: show something real rather than an empty box.
    els.jsonInput.value = SAMPLES[0].text;
  } else if (!restored && history[0]) {
    els.jsonInput.value = history[0].input;
    options = { ...options, ...history[0].options, formatId: history[0].formatId };
    syncControls();
  }

  run();

  // The fragment has served its purpose; leaving it in the address bar makes the
  // link look like page state and re-applies the payload on every reload.
  if (restored) clearLocationState();

  registerServiceWorker();
}

function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // `import.meta.env` only exists under Vite, and the dev server should not serve
  // a cached shell; optional chaining keeps this module loadable outside Vite.
  if (import.meta.env?.DEV !== false) return;
  const base = import.meta.env?.BASE_URL ?? '/';
  window.addEventListener('load', () => {
    // BASE_URL keeps this correct when the app is served from a sub-path.
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {
      /* offline support is a bonus, never a requirement */
    });
  });
}

/** Exposed for the browser console and for end-to-end checks. */
export const internals = { get options() { return options; }, state, run };
