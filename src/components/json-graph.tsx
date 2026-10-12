import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, LoaderCircle, Network, RefreshCw } from 'lucide-react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
} from '@xyflow/react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { GraphModel, JsonGraphNode } from '@/graph/json-to-graph';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';

const typeStyles: Record<string, string> = {
  object: 'border-sky-500/50 bg-sky-500/10', array: 'border-violet-500/50 bg-violet-500/10',
  string: 'border-emerald-500/50 bg-emerald-500/10', number: 'border-amber-500/50 bg-amber-500/10',
  boolean: 'border-orange-500/50 bg-orange-500/10', null: 'border-zinc-500/50 bg-zinc-500/10',
  documents: 'border-primary/50 bg-primary/10', omitted: 'border-dashed border-muted-foreground/50 bg-muted',
};

type WorkerResponse = { ok: true; model: GraphModel } | { ok: false; error: string };

function JsonNode({ data }: NodeProps<JsonGraphNode>) {
  return <div className={cn('h-[78px] w-[220px] rounded-lg border-2 bg-card px-3 py-2 shadow-sm', typeStyles[data.type])}>
    <Handle type="target" position={Position.Top} className="!size-2 !border-background !bg-muted-foreground" />
    <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{data.label}</strong><span className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{data.type}</span></div>
    <div className="mt-1.5 truncate font-mono text-xs text-muted-foreground" title={data.preview}>{data.preview}</div>
    <Handle type="source" position={Position.Bottom} className="!size-2 !border-background !bg-muted-foreground" />
  </div>;
}

const nodeTypes = { json: JsonNode };

export function JsonGraph() {
  const input = useAppStore((state) => state.input);
  const inputMode = useAppStore((state) => state.options.inputMode);
  const theme = useAppStore((state) => state.theme);
  const storedModel = useAppStore((state) => state.graphModel);
  const graphSource = useAppStore((state) => state.graphSource);
  const setGraphResult = useAppStore((state) => state.setGraphResult);
  const workerRef = useRef<Worker | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const model = graphSource === input ? storedModel : null;
  const stale = storedModel !== null && graphSource !== input;

  useEffect(() => () => workerRef.current?.terminate(), []);

  const buildGraph = (): void => {
    if (!input.trim() || building) return;
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../workers/graph.worker.ts', import.meta.url), { type: 'module' });
    const source = input;
    workerRef.current = worker;
    setBuilding(true);
    setError(null);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.ok) setGraphResult(event.data.model, source);
      else setError(event.data.error);
      setBuilding(false);
      worker.terminate();
      workerRef.current = null;
    };
    worker.onerror = () => {
      setError('The graph worker stopped unexpectedly. Try building the graph again.');
      setBuilding(false);
      worker.terminate();
      workerRef.current = null;
    };

    // Let React paint the blocking loader before cloning the input into the worker.
    window.setTimeout(() => worker.postMessage({ input: source, inputMode }), 0);
  };

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-medium"><Network className="size-4 text-primary" />Graph is built on demand</div>
        <p className="mt-1 text-sm text-muted-foreground">Nothing is calculated until you click the button. Large files are parsed in a background worker; the graph displays up to 1,000 nodes.</p>
      </div>
      <Button onClick={buildGraph} disabled={!input.trim() || building}>
        {model ? <RefreshCw /> : <Network />}{model ? 'Rebuild graph' : stale ? 'Build updated graph' : 'Build graph'}
      </Button>
    </div>

    {error && <Alert className="border-destructive/50 bg-destructive/10"><AlertTitle>Could not build graph</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {!input.trim() && <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Paste JSON before building a graph.</div>}
    {input.trim() && !model && !error && <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center text-sm text-muted-foreground"><Network className="size-8 opacity-50" /><div><div className="font-medium text-foreground">Graph has not been built yet</div><div className="mt-1">Click Build graph when you are ready.</div></div></div>}
    {model?.truncated && <Alert className="border-amber-500/40 bg-amber-500/10"><AlertTriangle className="mr-2 inline size-4" /><AlertTitle className="inline">Large graph was capped</AlertTitle><AlertDescription className="mt-1">Showing {model.renderedNodes.toLocaleString()} of {model.totalNodes.toLocaleString()} JSON nodes. Omitted branches are marked in the graph.</AlertDescription></Alert>}
    {model && <div className="h-[620px] overflow-hidden rounded-lg border bg-muted/20" data-testid="json-graph">
      <ReactFlow nodes={model.nodes} edges={model.edges} nodeTypes={nodeTypes} colorMode={theme} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.08} maxZoom={2}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>}

    {building && <div className="fixed inset-0 z-[100] grid place-items-center bg-background/85 p-6 backdrop-blur-sm" role="status" aria-live="assertive">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-2xl">
        <LoaderCircle className="mx-auto size-10 animate-spin text-primary" />
        <div className="mt-4 text-lg font-semibold">Building graph…</div>
        <p className="mt-2 text-sm text-muted-foreground">Parsing JSON and calculating the layout. A large file may take a moment.</p>
      </div>
    </div>}
  </div>;
}
