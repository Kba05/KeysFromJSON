import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { jsonToGraph, type JsonGraphNode } from '@/graph/json-to-graph';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';

const typeStyles: Record<string, string> = {
  object: 'border-sky-500/50 bg-sky-500/10', array: 'border-violet-500/50 bg-violet-500/10',
  string: 'border-emerald-500/50 bg-emerald-500/10', number: 'border-amber-500/50 bg-amber-500/10',
  boolean: 'border-orange-500/50 bg-orange-500/10', null: 'border-zinc-500/50 bg-zinc-500/10',
  documents: 'border-primary/50 bg-primary/10', omitted: 'border-dashed border-muted-foreground/50 bg-muted',
};

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
  const docs = useAppStore((state) => state.docs);
  const theme = useAppStore((state) => state.theme);
  const model = useMemo(() => jsonToGraph(docs), [docs]);

  if (docs.length === 0) return <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">Paste valid JSON to explore its graph.</div>;
  return <div className="space-y-3">
    {model.truncated && <Alert className="border-amber-500/40 bg-amber-500/10"><AlertTriangle className="mr-2 inline size-4" /><AlertTitle className="inline">Large graph was capped</AlertTitle><AlertDescription className="mt-1">Showing {model.renderedNodes.toLocaleString()} of {model.totalNodes.toLocaleString()} JSON nodes. Omitted branches are marked in the graph.</AlertDescription></Alert>}
    <div className="h-[620px] overflow-hidden rounded-lg border bg-muted/20" data-testid="json-graph">
      <ReactFlow nodes={model.nodes} edges={model.edges} nodeTypes={nodeTypes} colorMode={theme} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.08} maxZoom={2}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  </div>;
}
