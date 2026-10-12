import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

import type { JsonValue, ValueType } from '@/types';

export const GRAPH_NODE_LIMIT = 1000;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 78;

export interface JsonGraphNodeData extends Record<string, unknown> {
  label: string;
  type: ValueType | 'documents' | 'omitted';
  preview: string;
  count?: number;
  omitted?: number;
}

export type JsonGraphNode = Node<JsonGraphNodeData, 'json'>;
export type JsonGraphEdge = Edge;

export interface GraphModel {
  nodes: JsonGraphNode[];
  edges: JsonGraphEdge[];
  totalNodes: number;
  renderedNodes: number;
  truncated: boolean;
}

function valueTypeOf(value: JsonValue): ValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as ValueType;
}

function childEntries(value: JsonValue): Array<[string, JsonValue]> {
  if (Array.isArray(value)) return value.map((child, index) => [`[${index}]`, child]);
  if (value !== null && typeof value === 'object') return Object.entries(value);
  return [];
}

function countNodes(value: JsonValue): number {
  let count = 1;
  for (const [, child] of childEntries(value)) count += countNodes(child);
  return count;
}

function pointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function previewOf(value: JsonValue, type: ValueType): string {
  if (type === 'object') return `${Object.keys(value as Record<string, JsonValue>).length} keys`;
  if (type === 'array') return `${(value as JsonValue[]).length} items`;
  if (type === 'string') {
    const quoted = JSON.stringify(value);
    return quoted.length > 80 ? `${quoted.slice(0, 79)}…` : quoted;
  }
  return String(value);
}

function jsonNode(id: string, label: string, value: JsonValue): JsonGraphNode {
  const type = valueTypeOf(value);
  const count = type === 'array'
    ? (value as JsonValue[]).length
    : type === 'object'
      ? Object.keys(value as Record<string, JsonValue>).length
      : undefined;
  return {
    id,
    type: 'json',
    position: { x: 0, y: 0 },
    data: { label, type, preview: previewOf(value, type), count },
  };
}

/** Convert parsed JSON documents to a stable, view-only React Flow model. */
export function jsonToGraph(docs: JsonValue[], limit = GRAPH_NODE_LIMIT): GraphModel {
  const nodes: JsonGraphNode[] = [];
  const edges: JsonGraphEdge[] = [];
  const totalNodes = docs.reduce<number>((sum, doc) => sum + countNodes(doc), 0);
  let renderedNodes = 0;
  let omittedSequence = 0;

  const addValue = (value: JsonValue, id: string, label: string, parentId?: string, edgeLabel?: string): void => {
    if (renderedNodes >= limit) return;
    nodes.push(jsonNode(id, label, value));
    renderedNodes += 1;
    if (parentId) {
      edges.push({ id: `e:${parentId}:${id}`, source: parentId, target: id, label: edgeLabel, type: 'smoothstep' });
    }

    const entries = childEntries(value);
    for (let index = 0; index < entries.length; index += 1) {
      const [key, child] = entries[index];
      if (renderedNodes >= limit) {
        const omitted = entries.slice(index).reduce((sum, [, rest]) => sum + countNodes(rest), 0);
        const omittedId = `${id}/~omitted-${omittedSequence++}`;
        nodes.push({
          id: omittedId,
          type: 'json',
          position: { x: 0, y: 0 },
          data: { label: 'More', type: 'omitted', preview: `… ${omitted.toLocaleString()} nodes omitted`, omitted },
        });
        edges.push({ id: `e:${id}:${omittedId}`, source: id, target: omittedId, type: 'smoothstep' });
        break;
      }
      const segment = Array.isArray(value) ? String(index) : pointerSegment(key);
      const childId = `${id}/${segment}`;
      addValue(child, childId, Array.isArray(value) ? key : key, id, key);
    }
  };

  if (docs.length > 1) {
    const rootId = 'documents';
    nodes.push({
      id: rootId,
      type: 'json',
      position: { x: 0, y: 0 },
      data: { label: 'Documents', type: 'documents', preview: `${docs.length} documents`, count: docs.length },
    });
    for (let index = 0; index < docs.length; index += 1) {
      if (renderedNodes >= limit) {
        const omitted = docs.slice(index).reduce<number>((sum, doc) => sum + countNodes(doc), 0);
        const omittedId = `${rootId}/~omitted-${omittedSequence++}`;
        nodes.push({
          id: omittedId,
          type: 'json',
          position: { x: 0, y: 0 },
          data: { label: 'More documents', type: 'omitted', preview: `… ${omitted.toLocaleString()} nodes omitted`, omitted },
        });
        edges.push({ id: `e:${rootId}:${omittedId}`, source: rootId, target: omittedId, type: 'smoothstep' });
        break;
      }
      addValue(docs[index], `d${index}:`, `[${index}]`, rootId, `[${index}]`);
    }
  } else if (docs[0] !== undefined) {
    addValue(docs[0], 'd0:', '$');
  }

  return layoutGraph({ nodes, edges, totalNodes, renderedNodes, truncated: totalNodes > renderedNodes });
}

/** Dagre layout is deterministic and recomputed whenever the parsed document changes. */
export function layoutGraph(model: GraphModel): GraphModel {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'TB', ranksep: 72, nodesep: 34, marginx: 24, marginy: 24 });
  for (const node of model.nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const edge of model.edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);

  const nodes = model.nodes.map((node) => {
    const position = graph.node(node.id) as { x: number; y: number } | undefined;
    return {
      ...node,
      position: position
        ? { x: position.x - NODE_WIDTH / 2, y: position.y - NODE_HEIGHT / 2 }
        : node.position,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });
  return { ...model, nodes };
}
