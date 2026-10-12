import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import {
  Braces, Check, Clipboard, Code2, Download, FileJson, Github, History, Keyboard, Link2,
  Moon, RotateCcw, Save, Sun, Upload, WandSparkles, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { KeyTree } from '@/components/key-tree';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { parseDocuments, repairJson, stringifyJson } from '@/core/json-parse';
import { PATH_STYLE_EXAMPLES } from '@/core/keypath';
import { getFormatter, groupedFormatters } from '@/formats';
import { SUMMARY_TOKENS, TEMPLATE_TOKENS } from '@/formats/template';
import { downloadText, filesToText, suggestedFilename } from '@/ui/files';
import { clearHistory, loadHistory, type HistoryEntry } from '@/ui/history';
import {
  CASE_OPTIONS, DEDUPE_OPTIONS, INDENT_OPTIONS, NAME_SOURCE_OPTIONS, NODE_FILTER_OPTIONS, PATH_STYLE_OPTIONS,
  SEPARATOR_OPTIONS, SORT_OPTIONS, WRAPPER_PRESETS,
} from '@/ui/presets';
import { buildShareUrl, clearLocationState, readLocationState } from '@/ui/share';
import { DEFAULT_OPTIONS, type AppOptions } from '@/ui/state';
import { comparePathSets, pathSetOf, renderComparison, type CompareMode } from '@/ui/diff';
import { useAppStore } from '@/store/app-store';

type OptionKey = keyof AppOptions;
interface Choice { value: string; label: string }

const JsonGraph = lazy(() => import('@/components/json-graph').then((module) => ({ default: module.JsonGraph })));

async function copyText(text: string, label = 'Text'): Promise<void> {
  if (!text) { toast.warning(`Nothing to copy from ${label.toLowerCase()}`); return; }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
    document.execCommand('copy'); area.remove();
  }
  toast.success(`${label} copied`);
}

function ChoiceSelect({ id, value, choices, onChange, placeholder }: { id?: string; value: string; choices: Choice[]; onChange: (value: string) => void; placeholder?: string }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{choices.map((choice) => <SelectItem value={choice.value} key={choice.value}>{choice.label}</SelectItem>)}</SelectContent></Select>;
}

function ToolbarButton({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" {...props}>{children}<span className="hidden sm:inline">{label}</span></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function useAppInitialization(): void {
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      const shared = await readLocationState();
      if (shared.payload) {
        const payload = shared.payload;
        useAppStore.setState((state) => ({ input: payload.input, options: { ...state.options, ...payload.options, formatId: payload.formatId || state.options.formatId } }));
        clearLocationState();
        toast.info('Restored from the shared link');
      } else {
        if (shared.error) toast.error(shared.error);
        const history = loadHistory();
        if (history[0]) useAppStore.getState().restoreHistory(history[0]);
        else useAppStore.getState().nextSample();
      }
      useAppStore.getState().run(false);
    })();
  }, []);
}

function Header() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const restoreHistory = useAppStore((state) => state.restoreHistory);
  const run = useAppStore((state) => state.run);
  const [, refresh] = useState(0);
  const history = loadHistory();
  const restore = (entry: HistoryEntry) => { restoreHistory(entry); queueMicrotask(() => run(false)); toast.success('Restored from history'); };

  return <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
      <div className="flex items-center gap-2"><div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Braces className="size-5" /></div><div><h1 className="font-semibold leading-none">Keys from JSON</h1><p className="mt-1 text-xs text-muted-foreground">keys, paths, schemas & graph</p></div></div>
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" />runs in your browser</Badge>
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><History />History</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-80"><DropdownMenuLabel>Recent inputs</DropdownMenuLabel>{history.length === 0 && <div className="px-2 py-4 text-center text-sm text-muted-foreground">Nothing saved yet</div>}{history.map((entry) => <DropdownMenuItem key={entry.at} className="block" onSelect={() => restore(entry)}><div className="font-medium">{entry.formatId} · {new Date(entry.at).toLocaleString()}</div><div className="mt-1 truncate text-xs text-muted-foreground">{entry.input.replace(/\s+/g, ' ').slice(0, 90)}</div></DropdownMenuItem>)}{history.length > 0 && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => { clearHistory(); refresh((value) => value + 1); toast.info('History cleared'); }}>Clear history</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>
        <ShortcutsDialog />
        <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Switch theme">{theme === 'dark' ? <Sun /> : <Moon />}</Button>
      </div>
    </div>
  </header>;
}

function ShortcutsDialog() {
  const shortcuts = [['Ctrl/⌘ + K', 'Focus the JSON input'], ['Ctrl/⌘ + Enter', 'Render now'], ['Ctrl/⌘ + Shift + C', 'Copy output'], ['Ctrl/⌘ + Shift + F', 'Format input'], ['Ctrl/⌘ + Shift + K', 'Clear'], ['Ctrl/⌘ + /', 'Open shortcuts']];
  return <Dialog><DialogTrigger asChild><Button variant="outline" size="icon" aria-label="Keyboard shortcuts"><Keyboard /></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Everything important stays within reach.</DialogDescription></DialogHeader><div className="grid gap-2">{shortcuts.map(([keys, action]) => <div key={keys} className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm"><kbd className="font-mono text-xs">{keys}</kbd><span className="text-muted-foreground">{action}</span></div>)}</div></DialogContent></Dialog>;
}

function InputCard() {
  const input = useAppStore((state) => state.input);
  const options = useAppStore((state) => state.options);
  const parseError = useAppStore((state) => state.parseError);
  const failedLine = useAppStore((state) => state.failedLine);
  const tooLarge = useAppStore((state) => state.tooLargeForLive);
  const format = useAppStore((state) => state.format);
  const docs = useAppStore((state) => state.docs);
  const fields = useAppStore((state) => state.fields);
  const setInput = useAppStore((state) => state.setInput);
  const setOption = useAppStore((state) => state.setOption);
  const run = useAppStore((state) => state.run);
  const clear = useAppStore((state) => state.clear);
  const nextSample = useAppStore((state) => state.nextSample);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const formatInput = () => {
    const parsed = parseDocuments(input, { mode: options.inputMode });
    if (!parsed.ok) { toast.error(`Cannot format: ${parsed.error.message}`); return; }
    const indent = options.indent === 'tab' ? 'tab' : Number(options.indent);
    setInput(parsed.docs.length === 1 ? stringifyJson(parsed.docs[0], indent) : parsed.docs.map((doc) => stringifyJson(doc, indent)).join('\n'));
    toast.success('Input formatted');
  };
  const minify = () => {
    const parsed = parseDocuments(input, { mode: options.inputMode });
    if (!parsed.ok) { toast.error(`Cannot minify: ${parsed.error.message}`); return; }
    setInput(parsed.docs.map((doc) => JSON.stringify(doc)).join('\n')); toast.success('Input minified');
  };
  const repair = () => {
    const result = repairJson(input, options.indent === 'tab' ? 2 : Number(options.indent));
    if (!result.ok) { toast.error(`Could not repair: ${result.error.message}`); return; }
    setInput(result.text); toast.success('JSON repaired');
  };
  const openFiles = async (files: FileList | File[]) => {
    const result = await filesToText(files);
    if (result.error) { toast.error(result.error); return; }
    setInput(result.text); toast.success(result.names.length === 1 ? `Loaded ${result.names[0]}` : `Loaded ${result.names.length} files as JSON Lines`);
  };

  return <Card className="flex min-h-[520px] flex-col">
    <CardHeader className="gap-3"><div className="flex flex-wrap items-center gap-2"><div><CardTitle>JSON input</CardTitle><CardDescription>Paste, drop, or open JSON and NDJSON files.</CardDescription></div><div className="ml-auto flex flex-wrap gap-2">
      <ChoiceSelect value={options.inputMode} onChange={(value) => setOption('inputMode', value as AppOptions['inputMode'])} choices={[{ value: 'auto', label: 'Auto-detect' }, { value: 'json', label: 'JSON only' }, { value: 'ndjson', label: 'NDJSON' }, { value: 'relaxed', label: 'Relaxed' }]} />
      <ToolbarButton label="Format" data-action="format" onClick={formatInput}><WandSparkles /></ToolbarButton><ToolbarButton label="Minify" onClick={minify}><Code2 /></ToolbarButton><ToolbarButton label="Sample" onClick={() => toast.info(`Loaded ${nextSample()}`)}><FileJson /></ToolbarButton><ToolbarButton label="Open" onClick={() => fileRef.current?.click()}><Upload /></ToolbarButton><ToolbarButton label="Clear" onClick={clear}><X /></ToolbarButton>
    </div></div></CardHeader>
    <CardContent className="flex flex-1 flex-col gap-3">
      {parseError && <Alert className="border-destructive/50 bg-destructive/10"><AlertTitle>{parseError.message}</AlertTitle><AlertDescription><div>Line {parseError.line}, column {parseError.column}{failedLine ? ` · NDJSON line ${failedLine}` : ''}</div><pre className="mt-2 overflow-x-auto rounded bg-background/70 p-2 font-mono text-xs">{parseError.snippet}{'\n'}{parseError.caret}</pre>{parseError.repairable && <Button variant="destructive" size="sm" className="mt-3" onClick={repair}>Repair JSON</Button>}</AlertDescription></Alert>}
      <div className={`relative flex-1 rounded-lg ${dragging ? 'ring-2 ring-primary' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length) void openFiles(event.dataTransfer.files); }}>
        <Textarea id="jsonInput" aria-label="JSON input" value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} className="h-full min-h-[340px] resize-y font-mono text-[13px] leading-relaxed" placeholder={'Paste JSON here, or drop a file\n\n{ "user": { "id": 1, "name": "Ada" } }'} />
        {dragging && <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg bg-primary/10 text-sm font-medium">Drop JSON files here</div>}
      </div>
      <input ref={fileRef} type="file" accept=".json,.ndjson,.jsonl,.txt,application/json" multiple hidden onChange={(event) => { if (event.target.files?.length) void openFiles(event.target.files); event.target.value = ''; }} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{input.length.toLocaleString()} characters</span>{input.includes('\n') && <span>{input.split('\n').length.toLocaleString()} lines</span>}{format === 'ndjson' && <span>NDJSON</span>}{docs.length > 1 && <span>{docs.length} documents</span>}{fields.length > 0 && <span>{fields.length.toLocaleString()} keys</span>}{tooLarge && <button className="font-medium text-amber-600" onClick={() => run()}>Live rendering paused — render now</button>}</div>
    </CardContent>
  </Card>;
}

function OutputCard() {
  const output = useAppStore((state) => state.output);
  const stats = useAppStore((state) => state.stats);
  const outputError = useAppStore((state) => state.outputError);
  const options = useAppStore((state) => state.options);
  const setOption = useAppStore((state) => state.setOption);
  const formatter = getFormatter(options.formatId);
  const groups = groupedFormatters();
  const share = async () => {
    const result = await buildShareUrl({ input: useAppStore.getState().input, options, formatId: options.formatId });
    if (result.error) { toast.error(result.error); return; }
    window.history.replaceState(null, '', result.url); await copyText(result.url, 'Link');
  };
  return <Card className="flex min-h-[520px] flex-col"><CardHeader className="gap-3"><div className="flex flex-wrap items-center gap-2"><div><CardTitle>Output</CardTitle><CardDescription>{formatter?.hint ?? 'Choose an output format.'}</CardDescription></div><div className="ml-auto flex flex-wrap gap-2">
    <Select value={options.formatId} onValueChange={(value) => setOption('formatId', value)}><SelectTrigger id="formatSelect" className="w-52"><SelectValue /></SelectTrigger><SelectContent>{groups.map((group) => <SelectGroup key={group.id}><SelectLabel>{group.label}</SelectLabel>{group.formatters.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup>)}</SelectContent></Select>
    <Button size="sm" onClick={() => void copyText(output, 'Output')}><Clipboard />Copy</Button><ToolbarButton label="Save" onClick={() => output ? downloadText(suggestedFilename(options.formatId, options.typeName), output) : toast.warning('Nothing to save yet')}><Save /></ToolbarButton><ToolbarButton label="Link" onClick={() => void share()}><Link2 /></ToolbarButton>
  </div></div></CardHeader><CardContent className="flex flex-1 flex-col gap-3">{outputError && <Alert className="border-destructive/50 text-destructive"><AlertTitle>Formatter error</AlertTitle><AlertDescription>{outputError}</AlertDescription></Alert>}<pre id="output" tabIndex={0} className="min-h-[340px] flex-1 overflow-auto whitespace-pre rounded-lg border bg-code p-4 font-mono text-[13px] leading-relaxed" aria-live="polite">{output}</pre><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{formatter?.label}</span>{stats.scanned > 0 && <span>{stats.unique.toLocaleString()} in output</span>}{stats.duplicates > 0 && <span>{stats.duplicates.toLocaleString()} duplicates removed</span>}{stats.matched !== stats.scanned && <span>{stats.matched.toLocaleString()} of {stats.scanned.toLocaleString()} matched</span>}</div></CardContent></Card>;
}

function OptionField({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) { return <div className="space-y-1.5"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>; }

function OptionsCard() {
  const options = useAppStore((state) => state.options);
  const errors = useAppStore((state) => state.errors);
  const setOption = useAppStore((state) => state.setOption);
  const resetOptions = useAppStore((state) => state.resetOptions);
  const update = <K extends OptionKey>(key: K) => (value: string) => setOption(key, value as AppOptions[K]);
  const check = <K extends OptionKey>(key: K) => (value: boolean | 'indeterminate') => setOption(key, (value === true) as AppOptions[K]);
  const groups = [
    { id: 'wrapper', title: 'Key wrapper', content: <div className="grid gap-4 md:grid-cols-2"><RadioGroup value={options.wrapperMode} onValueChange={(value) => setOption('wrapperMode', value as AppOptions['wrapperMode'])} className="flex gap-4"><div className="flex items-center gap-2"><RadioGroupItem id="wrapper-preset" value="preset" /><Label htmlFor="wrapper-preset">Preset</Label></div><div className="flex items-center gap-2"><RadioGroupItem id="wrapper-custom" value="custom" /><Label htmlFor="wrapper-custom">Custom</Label></div></RadioGroup><ChoiceSelect value={options.wrapperPresetId} onChange={update('wrapperPresetId')} choices={WRAPPER_PRESETS.map(({ id, label }) => ({ value: id, label }))} /><OptionField label="Left"><Input value={options.wrapperLeft} disabled={options.wrapperMode !== 'custom'} onChange={(event) => setOption('wrapperLeft', event.target.value)} /></OptionField><OptionField label="Right"><Input value={options.wrapperRight} disabled={options.wrapperMode !== 'custom' || options.wrapperMirror} onChange={(event) => setOption('wrapperRight', event.target.value)} /></OptionField><label className="flex items-center gap-2 text-sm"><Checkbox checked={options.wrapperMirror} disabled={options.wrapperMode !== 'custom'} onCheckedChange={check('wrapperMirror')} />Auto-close or mirror left</label></div> },
    { id: 'names', title: 'Names, paths & ordering', content: <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><OptionField label="Name source"><ChoiceSelect value={options.nameSource} onChange={update('nameSource')} choices={NAME_SOURCE_OPTIONS} /></OptionField><OptionField label="Case"><ChoiceSelect value={options.caseMode} onChange={update('caseMode')} choices={CASE_OPTIONS} /></OptionField><OptionField label="Separator"><ChoiceSelect value={options.separator} onChange={update('separator')} choices={SEPARATOR_OPTIONS} /></OptionField><OptionField label="Sort"><ChoiceSelect value={options.sortMode} onChange={update('sortMode')} choices={SORT_OPTIONS} /></OptionField><OptionField label="Path notation"><ChoiceSelect value={options.pathStyle} onChange={update('pathStyle')} choices={PATH_STYLE_OPTIONS} /><p className="text-xs text-muted-foreground">{PATH_STYLE_EXAMPLES[options.pathStyle]}</p></OptionField><label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={options.realIndices} onCheckedChange={check('realIndices')} />Use real array indices</label></div> },
    { id: 'filtering', title: 'Filtering & patterns', content: <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><OptionField label="Node filter"><ChoiceSelect value={options.nodeFilter} onChange={update('nodeFilter')} choices={NODE_FILTER_OPTIONS} /></OptionField><OptionField label="Max depth"><Input type="number" min={0} value={options.maxDepth} onChange={(event) => setOption('maxDepth', event.target.value)} placeholder="Unlimited" /></OptionField><OptionField label="De-duplicate by"><ChoiceSelect value={options.dedupeBy} onChange={update('dedupeBy')} choices={DEDUPE_OPTIONS} /></OptionField><label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={options.ignoreCase} onCheckedChange={check('ignoreCase')} />Ignore case</label><OptionField label="Substring"><Input value={options.search} onChange={(event) => setOption('search', event.target.value)} placeholder="Filter key list" /></OptionField><OptionField label="Include regex"><Input value={options.includePattern} onChange={(event) => setOption('includePattern', event.target.value)} placeholder="^user_" />{errors.include && <p className="text-xs text-destructive">{errors.include}</p>}</OptionField><OptionField label="Exclude regex"><Input value={options.excludePattern} onChange={(event) => setOption('excludePattern', event.target.value)} placeholder="_meta$" />{errors.exclude && <p className="text-xs text-destructive">{errors.exclude}</p>}</OptionField></div> },
    { id: 'generated', title: 'Generated code', content: <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><OptionField label="Root type / table name"><Input value={options.typeName} onChange={(event) => setOption('typeName', event.target.value)} /></OptionField><OptionField label="Indent"><ChoiceSelect value={options.indent} onChange={update('indent')} choices={INDENT_OPTIONS} /></OptionField><label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={options.skeletonTyped} onCheckedChange={check('skeletonTyped')} />Typed placeholders</label><label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={options.tsReadonly} onCheckedChange={check('tsReadonly')} />TypeScript readonly</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={options.tsExported} onCheckedChange={check('tsExported')} />Export TypeScript declarations</label></div> },
  ];
  const template = options.formatId === 'custom-template' || options.formatId === 'template-list';
  return <Card><CardHeader className="flex-row items-center"><div><CardTitle>Options</CardTitle><CardDescription>Transform and filter keys without touching the input.</CardDescription></div><Button variant="outline" size="sm" className="ml-auto" onClick={() => { resetOptions(); toast.info('Options reset'); }}><RotateCcw />Reset</Button></CardHeader><CardContent><Accordion type="multiple" defaultValue={['names']} className="w-full">{groups.map((group) => <AccordionItem key={group.id} value={group.id}><AccordionTrigger>{group.title}</AccordionTrigger><AccordionContent>{group.content}</AccordionContent></AccordionItem>)}</Accordion>
    {template && <div className="mt-5 grid gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-2"><OptionField label="Header"><Textarea value={options.templateHeader} onChange={(event) => setOption('templateHeader', event.target.value)} className="font-mono" /></OptionField><OptionField label="Footer"><Textarea value={options.templateFooter} onChange={(event) => setOption('templateFooter', event.target.value)} className="font-mono" /></OptionField><div className="md:col-span-2"><OptionField label="Line per key"><Textarea value={options.template} onChange={(event) => setOption('template', event.target.value)} className="font-mono" /></OptionField><div className="mt-2 flex flex-wrap gap-1">{[...SUMMARY_TOKENS, ...TEMPLATE_TOKENS].map((token) => <Badge variant="outline" key={`${token.token}-${token.description}`} className="font-mono">{'{{'}{token.token}{'}}'}</Badge>)}</div></div></div>}
  </CardContent></Card>;
}

function AnalysisCard() {
  const tab = useAppStore((state) => state.analysisTab);
  const setTab = useAppStore((state) => state.setAnalysisTab);
  return <Card><CardHeader><CardTitle>Structure explorer</CardTitle><CardDescription>Select output paths in the tree or explore the original JSON as a graph.</CardDescription></CardHeader><CardContent><Tabs value={tab} onValueChange={(value) => setTab(value as 'tree' | 'graph')}><TabsList><TabsTrigger value="tree">Tree</TabsTrigger><TabsTrigger value="graph">Graph</TabsTrigger></TabsList><TabsContent value="tree"><KeyTree /></TabsContent><TabsContent value="graph"><Suspense fallback={<div className="flex h-80 items-center justify-center text-sm text-muted-foreground">Loading graph…</div>}><JsonGraph /></Suspense></TabsContent></Tabs></CardContent></Card>;
}

function CompareCard() {
  const input = useAppStore((state) => state.input);
  const docs = useAppStore((state) => state.docs);
  const compareInput = useAppStore((state) => state.compareInput);
  const options = useAppStore((state) => state.options);
  const mode = useAppStore((state) => state.compareMode);
  const setCompareInput = useAppStore((state) => state.setCompareInput);
  const setMode = useAppStore((state) => state.setCompareMode);
  const report = useMemo(() => {
    if (!compareInput.trim()) return 'Paste a second document to see the union, shared keys, and differences.';
    if (docs.length === 0) return 'The first document does not parse yet.';
    const parsed = parseDocuments(compareInput, { mode: options.inputMode });
    if (!parsed.ok) return `The second document does not parse: ${parsed.error.message} (line ${parsed.error.line}, column ${parsed.error.column})`;
    const pathOptions = { pathStyle: options.pathStyle, realIndices: options.realIndices };
    const setA = new Set<string>(); docs.forEach((doc) => pathSetOf(doc, pathOptions).forEach((path) => setA.add(path)));
    const setB = new Set<string>(); parsed.docs.forEach((doc) => pathSetOf(doc, pathOptions).forEach((path) => setB.add(path)));
    return renderComparison(comparePathSets(setA, setB, mode), mode);
  }, [compareInput, docs, mode, options.inputMode, options.pathStyle, options.realIndices]);
  const modes: Array<{ value: CompareMode; label: string }> = [{ value: 'union', label: 'Union' }, { value: 'intersection', label: 'Shared' }, { value: 'only-a', label: 'Only A' }, { value: 'only-b', label: 'Only B' }];
  return <Card><CardHeader className="flex-row flex-wrap items-center gap-3"><div><CardTitle>Compare documents</CardTitle><CardDescription>Diff key paths between the current input and another payload.</CardDescription></div><div className="ml-auto flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setCompareInput(input)}>Use current input</Button>{modes.map((item) => <Button key={item.value} variant={mode === item.value ? 'secondary' : 'outline'} size="sm" onClick={() => setMode(item.value)}>{item.label}</Button>)}<Button variant="outline" size="sm" onClick={() => void copyText(report, 'Comparison')}><Clipboard />Copy</Button></div></CardHeader><CardContent className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><Textarea aria-label="Second JSON document" value={compareInput} onChange={(event) => setCompareInput(event.target.value)} spellCheck={false} className="min-h-48 font-mono text-xs" placeholder="Paste a second JSON document" /><pre className="min-h-48 overflow-auto whitespace-pre-wrap rounded-lg border bg-code p-4 font-mono text-xs">{report}</pre></CardContent></Card>;
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined); }, { once: true });
}

export default function App() {
  useAppInitialization();
  const input = useAppStore((state) => state.input);
  const options = useAppStore((state) => state.options);
  const selectedPaths = useAppStore((state) => state.selectedPaths);
  const tooLarge = useAppStore((state) => state.tooLargeForLive);
  const theme = useAppStore((state) => state.theme);
  const output = useAppStore((state) => state.output);
  const run = useAppStore((state) => state.run);
  const clear = useAppStore((state) => state.clear);

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.style.colorScheme = theme; }, [theme]);
  useEffect(() => { if (tooLarge) return; const id = window.setTimeout(() => run(), 160); return () => window.clearTimeout(id); }, [input, options, selectedPaths, tooLarge, run]);
  useEffect(registerServiceWorker, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'k' && !event.shiftKey) { event.preventDefault(); const inputElement = document.getElementById('jsonInput') as HTMLTextAreaElement | null; inputElement?.focus(); inputElement?.select(); }
      else if (key === 'enter') { event.preventDefault(); run(); }
      else if (key === 'c' && event.shiftKey) { event.preventDefault(); void copyText(output, 'Output'); }
      else if (key === 'k' && event.shiftKey) { event.preventDefault(); clear(); }
      else if (key === 'f' && event.shiftKey) { event.preventDefault(); const button = document.querySelector<HTMLButtonElement>('[data-action="format"]'); button?.click(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [clear, output, run]);

  return <TooltipProvider delayDuration={300}><div className="min-h-svh bg-background text-foreground"><Header /><main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-5 lg:px-6"><div className="grid gap-4 xl:grid-cols-2"><InputCard /><OutputCard /></div><OptionsCard /><AnalysisCard /><CompareCard /></main><footer className="border-t"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-5 text-sm text-muted-foreground lg:px-6"><span>Nothing leaves this tab — no upload, no analytics.</span><a className="ml-auto inline-flex items-center gap-2 hover:text-foreground" href="https://github.com/Kba05/KeysFromJSON" rel="noopener noreferrer"><Github className="size-4" />Source on GitHub</a></div></footer></div></TooltipProvider>;
}
