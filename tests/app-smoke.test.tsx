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
import { LIVE_INPUT_LIMIT, useAppStore } from '../src/store/app-store';
import { pushHistory } from '../src/ui/history';
import { DEFAULT_OPTIONS } from '../src/ui/state';

const resetStore = () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  useAppStore.setState({
    input: '', compareInput: '', options: { ...DEFAULT_OPTIONS }, theme: 'light', selectedPaths: null,
    collapsedPaths: new Set(), analysisTab: 'tree', compareMode: 'union', tooLargeForLive: false, sampleIndex: 0,
    docs: [], fields: [], tree: null, schema: buildSchema([]), items: [],
    stats: { scanned: 0, matched: 0, unique: 0, duplicates: 0, maxDepth: 0 },
    errors: { include: null, exclude: null }, output: '', outputError: null, parseError: null, format: null,
  });
};

beforeEach(resetStore);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function renderApp() {
  render(<App />);
  await waitFor(() => expect((screen.getByLabelText('JSON input') as HTMLTextAreaElement).value.length).toBeGreaterThan(0));
}

describe('React application', () => {
  test('boots a first visit with a sample and generated output', async () => {
    await renderApp();
    await waitFor(() => expect(document.getElementById('output')?.textContent).toContain('"id"'));
    expect(screen.getByText('Structure explorer')).toBeInTheDocument();
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
    expect(await screen.findByTestId('json-graph')).toBeInTheDocument();
    expect(screen.getByTestId('flow-canvas')).toHaveTextContent(/nodes/);
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

  test('pauses live rendering for very large input', async () => {
    await renderApp();
    const huge = `{"value":"${'x'.repeat(LIVE_INPUT_LIMIT)}"}`;
    fireEvent.change(screen.getByLabelText('JSON input'), { target: { value: huge } });
    expect(await screen.findByText(/Live rendering paused/)).toBeInTheDocument();
    expect(useAppStore.getState().tooLargeForLive).toBe(true);
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
