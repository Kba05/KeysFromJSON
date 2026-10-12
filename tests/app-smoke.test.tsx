// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes }: { nodes: unknown[] }) => <div data-testid="flow-canvas">{nodes.length} nodes</div>,
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  MiniMap: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  BackgroundVariant: { Dots: 'dots' },
}));

import App from '../src/App';
import { buildSchema } from '../src/core/schema';
import { jsonToGraph } from '../src/graph/json-to-graph';
import { LIVE_INPUT_LIMIT, TREE_FIELD_LIMIT, useAppStore } from '../src/store/app-store';
import { pushHistory } from '../src/ui/history';
import { DEFAULT_OPTIONS } from '../src/ui/state';

const resetStore = () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  useAppStore.setState({
    input: '', compareInput: '', options: { ...DEFAULT_OPTIONS }, theme: 'light', selectedPaths: null,
    collapsedPaths: new Set(), analysisTab: 'tree', compareMode: 'union', tooLargeForLive: false, sampleIndex: 0,
    graphModel: null, graphSource: null,
    docs: [], fields: [], tree: null, treeTruncated: false, treePathCount: 0, schema: buildSchema([]), items: [],
    stats: { scanned: 0, matched: 0, unique: 0, duplicates: 0, maxDepth: 0 },
    errors: { include: null, exclude: null }, output: '', outputError: null, parseError: null, format: null, analysisSource: null,
  });
};

class GraphWorkerMock {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage(): void {
    queueMicrotask(() => this.onmessage?.({ data: { ok: true, model: jsonToGraph([{ mock: true }]) } } as MessageEvent));
  }
  terminate(): void {}
}

beforeEach(() => { resetStore(); vi.stubGlobal('Worker', GraphWorkerMock); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function renderApp() {
  render(<App />);
  await waitFor(() => expect((screen.getByLabelText('JSON input') as HTMLTextAreaElement).value.length).toBeGreaterThan(0));
}

describe('React application', () => {
  test('boots a first visit with a sample and generated output', async () => {
    await renderApp();
    await waitFor(() => expect(document.getElementById('output')?.textContent).toContain('"id"'));
    expect(screen.getByText('Structure explorer')).toBeInTheDocument();
    const inputHeading = screen.getByRole('heading', { name: 'JSON input' });
    const settingsHeading = screen.getByRole('heading', { name: 'Output settings' });
    const outputHeading = screen.getByRole('heading', { name: 'Output' });
    const copyButton = screen.getAllByRole('button', { name: 'Copy' })[0];
    expect(inputHeading.compareDocumentPosition(outputHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settingsHeading.compareDocumentPosition(copyButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('reports invalid JSON with a location', async () => {
    await renderApp();
    fireEvent.change(screen.getByLabelText('JSON input'), { target: { value: '{bad json' } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Line 1, column/));
    expect(document.getElementById('output')).toHaveTextContent('');
  });

  test('repairs a recoverable document', async () => {
    await renderApp();
    fireEvent.change(screen.getByLabelText('JSON input'), { target: { value: "{a: 1,}" } });
    const repair = await screen.findByRole('button', { name: 'Repair JSON' });
    await userEvent.click(repair);
    await waitFor(() => expect((screen.getByLabelText('JSON input') as HTMLTextAreaElement).value).toContain('"a"'));
  });

  test('reacts to formatter option changes through Zustand', async () => {
    await renderApp();
    act(() => useAppStore.getState().setOption('formatId', 'ts-type'));
    await waitFor(() => expect(document.getElementById('output')?.textContent).toContain('export type Root'));
  });

  test('switches between tree and graph views', async () => {
    await renderApp();
    await userEvent.click(screen.getByRole('tab', { name: 'Graph' }));
    expect(await screen.findByText('Graph has not been built yet')).toBeInTheDocument();
    expect(screen.queryByTestId('json-graph')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Build graph' }));
    expect(await screen.findByTestId('json-graph')).toBeInTheDocument();
    expect(screen.getByTestId('flow-canvas')).toHaveTextContent(/nodes/);
    fireEvent.change(screen.getByLabelText('JSON input'), { target: { value: '{"changed":true}' } });
    expect(screen.queryByTestId('json-graph')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build updated graph' })).toBeInTheDocument();
  });

  test('toggles the document theme', async () => {
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Switch theme' }));
    expect(document.documentElement).toHaveClass('dark');
  });

  test('focuses the input with Ctrl+K', async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByLabelText('JSON input')).toHaveFocus();
  });

  test('compares the current input with another document', async () => {
    await renderApp();
    fireEvent.change(screen.getByLabelText('Second JSON document'), { target: { value: '{"id":1,"extra":true}' } });
    await waitFor(() => expect(screen.getByText(/Union of both documents/)).toBeInTheDocument());
    expect(screen.getByText(/\+ extra/)).toBeInTheDocument();
  });

  test('formats and minifies input from the toolbar', async () => {
    await renderApp();
    fireEvent.change(screen.getByLabelText('JSON input'), { target: { value: '{"a": 1}' } });
    await userEvent.click(screen.getByRole('button', { name: 'Minify' }));
    expect(screen.getByLabelText('JSON input')).toHaveValue('{"a":1}');
    await userEvent.click(screen.getByRole('button', { name: 'Format' }));
    expect(screen.getByLabelText('JSON input')).toHaveValue('{\n  "a": 1\n}');
  });

  test('renders NDJSON as multiple documents', async () => {
    await renderApp();
    act(() => useAppStore.getState().setOption('inputMode', 'ndjson'));
    fireEvent.change(screen.getByLabelText('JSON input'), { target: { value: '{"a":1}\n{"b":2}' } });
    await waitFor(() => expect(useAppStore.getState().docs).toHaveLength(2));
    expect(screen.getByText('2 documents')).toBeInTheDocument();
  });

  test('tree selection narrows formatter output by stable path', async () => {
    await renderApp();
    fireEvent.change(screen.getByLabelText('JSON input'), { target: { value: '{"user":{"id":1},"other":2}' } });
    await waitFor(() => expect(document.getElementById('output')).toHaveTextContent('"other"'));
    const checkbox = await screen.findByRole('checkbox', { name: 'Select user' });
    await userEvent.click(checkbox);
    await waitFor(() => expect(document.getElementById('output')).not.toHaveTextContent('"user"'));
    expect(document.getElementById('output')).not.toHaveTextContent('"id"');
    expect(document.getElementById('output')).toHaveTextContent('"other"');
  });

  test('custom template options update generated output', async () => {
    await renderApp();
    act(() => {
      useAppStore.getState().setOption('formatId', 'custom-template');
      useAppStore.getState().setOption('template', '{{index}}={{path}}');
    });
    await waitFor(() => expect(document.getElementById('output')?.textContent).toContain('1=id'));
  });

  test('loads a very large file without mounting its full text in the editor', async () => {
    await renderApp();
    const huge = `{"value":"${'x'.repeat(LIVE_INPUT_LIMIT)}"}`;
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File([huge], 'large.json', { type: 'application/json' });
    fireEvent.change(fileInput!, { target: { files: [file] } });
    expect(await screen.findByText('Large JSON loaded')).toBeInTheDocument();
    expect(useAppStore.getState().tooLargeForLive).toBe(true);
    await waitFor(() => expect(document.getElementById('output')).toHaveTextContent('"value"'));
    expect(screen.getByText(/Large document analyzed/)).toBeInTheDocument();
    expect(screen.getByLabelText('JSON input')).not.toBeInstanceOf(HTMLTextAreaElement);
  });

  test('keeps an oversized tree usable with a visible path limit', async () => {
    await renderApp();
    const documentWithManyPaths = Object.fromEntries(Array.from({ length: TREE_FIELD_LIMIT + 2 }, (_, index) => [`key_${index}`, index]));
    act(() => {
      useAppStore.getState().setInput(JSON.stringify(documentWithManyPaths));
      useAppStore.getState().run(false);
    });
    expect(useAppStore.getState().tree).not.toBeNull();
    expect(useAppStore.getState().treeTruncated).toBe(true);
    expect(useAppStore.getState().treePathCount).toBe(TREE_FIELD_LIMIT + 2);
    expect(await screen.findByText((content) => content.includes('Showing the first 4,000'))).toBeInTheDocument();
    expect(screen.getByText(/more root branches hidden/)).toBeInTheDocument();
  });

  test('restores the latest compatible history entry', async () => {
    pushHistory({ input: '{"historic":true}', formatId: 'quoted-list', options: { ...DEFAULT_OPTIONS } });
    await renderApp();
    expect(screen.getByLabelText('JSON input')).toHaveValue('{"historic":true}');
    await waitFor(() => expect(document.getElementById('output')).toHaveTextContent('"historic"'));
  });

  test('creates a backward-compatible share fragment', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#[01][A-Za-z0-9_-]+/));
    expect(writeText).toHaveBeenCalledOnce();
  });

  test('clears input with Ctrl+Shift+K', async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, shiftKey: true });
    expect(screen.getByLabelText('JSON input')).toHaveValue('');
  });
});
