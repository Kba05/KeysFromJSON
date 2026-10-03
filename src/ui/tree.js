/**
 * The key tree.
 *
 * Selection and collapse state are keyed by *path*, not by record id, so a
 * selection survives edits to the JSON: as long as a path still exists it stays
 * checked. Record ids are reassigned on every parse and would lose the selection
 * on each keystroke.
 */

import { ARRAY_MARKER } from '../core/extract.js';
import { applyCase } from '../core/naming.js';
import { create } from './dom.js';

/** Joins path segments into a stable key. A character that cannot appear in JSON keys. */
export const PATH_SEPARATOR = '\u0000';

/** The stable selection key for a field. */
export function pathKeyOf(field) {
  return field.segments.join(PATH_SEPARATOR);
}

function createNode(segment, display, pathKey) {
  return {
    id: 0,
    segment,
    display,
    pathKey,
    isArrayMarker: segment === ARRAY_MARKER,
    children: new Map(),
    field: null,
    paths: [],
    count: 0,
  };
}

/**
 * Build the path tree for a set of fields.
 *
 * @param {import('../core/extract.js').Field[]} fields
 * @param {{caseMode?: string}} [options]
 */
export function buildTree(fields, options = {}) {
  const caseMode = options.caseMode || 'none';
  const root = createNode('', '', '');

  for (const field of fields) {
    let node = root;
    field.segments.forEach((segment, index) => {
      const isMarker = segment === ARRAY_MARKER;
      const display = isMarker ? '[]' : applyCase(segment, caseMode);
      let child = node.children.get(segment);
      if (!child) {
        child = createNode(segment, display, node.pathKey ? `${node.pathKey}${PATH_SEPARATOR}${segment}` : segment);
        node.children.set(segment, child);
      }
      node = child;
      if (index === field.segments.length - 1) node.field = field;
    });
  }

  annotate(root);
  root.nodes = new Map();
  index(root, root.nodes, 0);
  return root;
}

function annotate(node) {
  const paths = [];
  let count = 0;
  if (node.field) {
    paths.push(pathKeyOf(node.field));
    count += 1;
  }
  for (const child of node.children.values()) {
    annotate(child);
    paths.push(...child.paths);
    count += child.count;
  }
  node.paths = paths;
  node.count = count;
}

function index(node, registry, nextId) {
  node.id = nextId;
  registry.set(node.id, node);
  let next = nextId + 1;
  for (const child of node.children.values()) {
    next = index(child, registry, next);
  }
  return next;
}

/** How much of a node is selected: 'all', 'none' or 'partial'. */
export function selectionState(node, selectedPaths) {
  if (!selectedPaths) return 'all';
  if (node.paths.length === 0) return 'none';
  let selected = 0;
  for (const path of node.paths) if (selectedPaths.has(path)) selected += 1;
  if (selected === 0) return 'none';
  return selected === node.paths.length ? 'all' : 'partial';
}

/** Mark every node that matches the search text, directly or through a child. */
function markMatches(node, needle, memo) {
  if (memo.has(node.id)) return memo.get(node.id);
  let matched = !needle || node.display.toLowerCase().includes(needle);
  for (const child of node.children.values()) {
    if (markMatches(child, needle, memo)) matched = true;
  }
  memo.set(node.id, matched);
  return matched;
}

/**
 * Render the tree.
 *
 * @param {object} root result of {@link buildTree}
 * @param {{selectedPaths: Set<string>|null, collapsed: Set<string>, search?: string}} state
 * @returns {HTMLElement}
 */
export function renderTree(root, state) {
  const needle = (state.search || '').trim().toLowerCase();
  const memo = new Map();
  markMatches(root, needle, memo);

  const list = create('ul', { class: 'tree-list is-root' });

  if (root.children.size === 0) {
    list.append(create('li', { class: 'tree-empty', text: 'No keys found in this document.' }));
    return list;
  }

  for (const child of root.children.values()) {
    const item = renderNode(child, { ...state, needle, memo });
    if (item) list.append(item);
  }
  return list;
}

function renderNode(node, context) {
  const { selectedPaths, collapsed, needle, memo } = context;
  if (needle && !memo.get(node.id)) return null;

  const hasChildren = node.children.size > 0;
  const isCollapsed = collapsed.has(node.pathKey);
  const state = selectionState(node, selectedPaths);

  const checkbox = create('input', {
    class: 'form-check-input',
    type: 'checkbox',
    checked: state === 'all',
    dataset: { node: String(node.id) },
    'aria-label': `Select ${node.display || 'key'} and everything under it`,
  });
  checkbox.indeterminate = state === 'partial';

  const toggle = hasChildren
    ? create('button', {
        class: 'tree-toggle',
        type: 'button',
        text: isCollapsed ? '▸' : '▾',
        dataset: { collapse: node.pathKey },
        'aria-expanded': String(!isCollapsed),
        'aria-label': `${isCollapsed ? 'Expand' : 'Collapse'} ${node.display || 'key'}`,
      })
    : create('span', { class: 'tree-toggle', 'aria-hidden': 'true' });

  const row = create('div', { class: 'tree-row' }, [
    toggle,
    checkbox,
    create('span', {
      class: `tree-name${node.isArrayMarker ? ' is-array' : ''}`,
      text: node.isArrayMarker ? '' : node.display,
    }),
    node.field ? create('span', { class: 'tree-type', text: node.field.valueType }) : null,
    hasChildren ? create('span', { class: 'tree-count', text: String(node.count) }) : null,
  ]);

  const children = hasChildren
    ? create(
        'ul',
        { class: `tree-list${isCollapsed ? ' is-collapsed' : ''}` },
        [...node.children.values()].map((child) => renderNode(child, context)).filter(Boolean),
      )
    : null;

  return create('li', {}, [row, children]);
}

/** Every path under a node, used when a checkbox toggles a whole subtree. */
export function pathsOf(node) {
  return node.paths;
}
