import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { selectionState, type TreeNode } from '@/ui/tree';
import { toast } from 'sonner';

function TreeBranch({ node, search }: { node: TreeNode; search: string }) {
  const selectedPaths = useAppStore((state) => state.selectedPaths);
  const collapsed = useAppStore((state) => state.collapsedPaths);
  const toggleTreeNode = useAppStore((state) => state.toggleTreeNode);
  const toggleCollapsed = useAppStore((state) => state.toggleCollapsed);
  const hasChildren = node.children.size > 0;
  const isCollapsed = collapsed.has(node.pathKey);
  const selection = selectionState(node, selectedPaths);
  const matches = !search || node.display.toLowerCase().includes(search) || [...node.children.values()].some((child) => branchMatches(child, search));
  if (!matches) return null;
  return <li>
    <div className="flex min-h-8 items-center gap-2 rounded-md px-1.5 hover:bg-muted/60">
      {hasChildren ? <Button variant="ghost" size="icon" className="size-6" onClick={() => toggleCollapsed(node.pathKey)} aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${node.display}`}>
        {isCollapsed ? <ChevronRight /> : <ChevronDown />}
      </Button> : <span className="size-6" />}
      <Checkbox checked={selection === 'partial' ? 'indeterminate' : selection === 'all'} onCheckedChange={() => toggleTreeNode(node)} aria-label={`Select ${node.display}`} />
      <span className={cn('font-mono text-sm', node.isArrayMarker && 'text-muted-foreground')}>{node.isArrayMarker ? '[]' : node.display}</span>
      {node.field && <span className="ml-auto text-xs text-muted-foreground">{node.field.valueType}</span>}
      {hasChildren && <span className="text-xs tabular-nums text-muted-foreground">{node.count}</span>}
    </div>
    {hasChildren && !isCollapsed && <ul className="ml-4 border-l pl-3">{[...node.children.values()].map((child) => <TreeBranch key={child.pathKey} node={child} search={search} />)}</ul>}
  </li>;
}

function branchMatches(node: TreeNode, search: string): boolean {
  return node.display.toLowerCase().includes(search) || [...node.children.values()].some((child) => branchMatches(child, search));
}

export function KeyTree() {
  const tree = useAppStore((state) => state.tree);
  const fields = useAppStore((state) => state.fields);
  const selectedPaths = useAppStore((state) => state.selectedPaths);
  const selectAll = useAppStore((state) => state.selectAll);
  const selectNone = useAppStore((state) => state.selectNone);
  const selectLeaves = useAppStore((state) => state.selectLeaves);
  const selectMatches = useAppStore((state) => state.selectMatches);
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const roots = useMemo(() => tree ? [...tree.children.values()] : [], [tree]);

  if (fields.length === 0) return <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Paste JSON to see its keys here.</div>;
  if (!tree) return <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">This document has more than 4,000 keys, so the selection tree is hidden.</div>;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" placeholder="Filter the tree" /></div>
      <Button variant="outline" size="sm" onClick={selectAll}>All</Button><Button variant="outline" size="sm" onClick={selectNone}>None</Button><Button variant="outline" size="sm" onClick={selectLeaves}>Leaves</Button>
      <Button variant="outline" size="sm" onClick={() => { if (!selectMatches(query)) toast.warning('Type something in the tree filter first'); }}>Select matches</Button>
      <span className="ml-auto text-xs text-muted-foreground">{selectedPaths ? `${selectedPaths.size.toLocaleString()} paths selected` : 'all keys'}</span>
    </div>
    <div className="max-h-[560px] overflow-auto rounded-lg border p-2"><ul className="space-y-0.5">{roots.map((node) => <TreeBranch key={node.pathKey} node={node} search={search} />)}</ul></div>
  </div>;
}
