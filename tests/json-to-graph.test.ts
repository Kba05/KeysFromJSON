import { describe, expect, test } from 'vitest';

import { jsonToGraph } from '../src/graph/json-to-graph';

describe('jsonToGraph', () => {
  test('creates container and primitive nodes with labelled edges', () => {
    const graph = jsonToGraph([{ user: { id: 1, active: true } }]);
    expect(graph.totalNodes).toBe(4);
    expect(graph.nodes.map((node) => node.data.type)).toEqual(['object', 'object', 'number', 'boolean']);
    expect(graph.edges.map((edge) => edge.label)).toEqual(['user', 'id', 'active']);
  });

  test('uses array indices as edge labels and stable ids', () => {
    const first = jsonToGraph([[{ id: 1 }, { id: 2 }]]);
    const second = jsonToGraph([[{ id: 1 }, { id: 2 }]]);
    expect(first.nodes.map((node) => node.id)).toEqual(second.nodes.map((node) => node.id));
    expect(first.edges.map((edge) => edge.label)).toContain('[1]');
  });

  test('escapes JSON Pointer characters in object keys', () => {
    const graph = jsonToGraph([{ 'a/b~c': 1 }]);
    expect(graph.nodes.some((node) => node.id.endsWith('/a~1b~0c'))).toBe(true);
  });

  test('supports a primitive root', () => {
    const graph = jsonToGraph(['hello']);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.data).toMatchObject({ label: '$', type: 'string', preview: '"hello"' });
  });

  test('adds a virtual root for NDJSON documents', () => {
    const graph = jsonToGraph([{ a: 1 }, { b: 2 }]);
    expect(graph.nodes[0]?.data).toMatchObject({ label: 'Documents', type: 'documents' });
    expect(graph.edges.filter((edge) => edge.source === 'documents').map((edge) => edge.label)).toEqual(['[0]', '[1]']);
  });

  test('truncates long string previews without changing the source value', () => {
    const value = 'x'.repeat(120);
    const graph = jsonToGraph([{ value }]);
    const node = graph.nodes.find((item) => item.data.label === 'value');
    expect(node?.data.preview.endsWith('…')).toBe(true);
    expect(value).toHaveLength(120);
  });

  test('caps real nodes and adds an omitted placeholder', () => {
    const graph = jsonToGraph([{ a: 1, b: 2, c: 3 }], 2);
    expect(graph.truncated).toBe(true);
    expect(graph.renderedNodes).toBe(2);
    expect(graph.nodes.some((node) => node.data.type === 'omitted')).toBe(true);
    expect(graph.totalNodes).toBe(4);
  });

  test('summarises whole NDJSON documents hidden by the cap', () => {
    const graph = jsonToGraph([{ a: 1 }, { b: 2 }, { c: 3 }], 2);
    const omitted = graph.nodes.find((node) => node.data.type === 'omitted');
    expect(omitted?.data).toMatchObject({ label: 'More documents', omitted: 4 });
    expect(graph.edges.some((edge) => edge.source === 'documents' && edge.target === omitted?.id)).toBe(true);
  });

  test('returns an empty model for no documents', () => {
    const graph = jsonToGraph([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.truncated).toBe(false);
  });
});
