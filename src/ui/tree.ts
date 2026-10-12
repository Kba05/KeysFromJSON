import { ARRAY_MARKER } from '@/core/extract';
import { applyCase } from '@/core/naming';
import type { Field } from '@/types';

export const PATH_SEPARATOR = '\u0000';

export interface TreeNode {
  id: number;
  segment: string;
  display: string;
  pathKey: string;
  isArrayMarker: boolean;
  children: Map<string, TreeNode>;
  field: Field | null;
  paths: string[];
  count: number;
}
export interface TreeRoot extends TreeNode { nodes: Map<number, TreeNode> }

export function pathKeyOf(field: Field): string { return field.segments.join(PATH_SEPARATOR); }
function createNode(segment: string, display: string, pathKey: string): TreeNode {
  return { id: 0, segment, display, pathKey, isArrayMarker: segment === ARRAY_MARKER, children: new Map(), field: null, paths: [], count: 0 };
}
export function buildTree(fields: Field[], options: { caseMode?: string } = {}): TreeRoot {
  const root = createNode('', '', '') as TreeRoot;
  root.nodes = new Map();
  for (const field of fields) {
    let node: TreeNode = root;
    field.segments.forEach((segment, index) => {
      const display = segment === ARRAY_MARKER ? '[]' : applyCase(segment, options.caseMode ?? 'none');
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
  indexNodes(root, root.nodes, 0);
  return root;
}
function annotate(node: TreeNode): void {
  const paths: string[] = [];
  let count = 0;
  if (node.field) { paths.push(pathKeyOf(node.field)); count += 1; }
  for (const child of node.children.values()) { annotate(child); paths.push(...child.paths); count += child.count; }
  node.paths = paths;
  node.count = count;
}
function indexNodes(node: TreeNode, registry: Map<number, TreeNode>, nextId: number): number {
  node.id = nextId;
  registry.set(nextId, node);
  let next = nextId + 1;
  for (const child of node.children.values()) next = indexNodes(child, registry, next);
  return next;
}
export function selectionState(node: TreeNode, selectedPaths: Set<string> | null): 'all' | 'none' | 'partial' {
  if (!selectedPaths) return 'all';
  if (node.paths.length === 0) return 'none';
  const selected = node.paths.filter((path) => selectedPaths.has(path)).length;
  if (selected === 0) return 'none';
  return selected === node.paths.length ? 'all' : 'partial';
}
export function pathsOf(node: TreeNode): string[] { return node.paths; }
