# Keys from JSON

A private, offline-friendly JSON workbench for extracting keys and paths, generating code and schemas, comparing payloads, and exploring JSON as a tree or graph. Everything runs in the browser: there is no backend, account, analytics, or upload.

## Stack

- React 19, Vite 8, and TypeScript 7
- Zustand for typed application state and persisted preferences
- Tailwind CSS 4 and shadcn/ui-style components built on Radix primitives
- React Flow and Dagre for the read-only JSON graph
- Vitest and Testing Library
- pnpm with a committed lockfile

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The development server is available at `http://localhost:5173`. Production commands:

```bash
pnpm typecheck
pnpm test
pnpm check
pnpm build
pnpm check:build
```

`pnpm build` creates a static bundle in `dist/`. The production base path is `/KeysFromJSON/` for GitHub Pages.

## Features

- Strict JSON, NDJSON, auto-detection, and relaxed input modes
- Precise parse diagnostics and one-click repair for recoverable mistakes
- 36 output formats: key lists, path notations, TypeScript, Zod, JSON Schema, SQL, language models, templates, and more
- Filtering, sorting, case conversion, wrappers, de-duplication, regular expressions, and stable path-based selection
- The main workspace pairs equal-height `JSON input` and `Output` cards; settings sit at the top of Output before its format and actions, and never affect the source JSON, Tree, or Graph
- Tri-state tree selection; large documents show the first 4,000 unique paths, start collapsed, and cap visible siblings so the browser stays responsive
- Read-only graph view with pan, zoom, minimap, controls, type colors, and Dagre layout
- Document comparison: union, shared paths, only A, and only B
- Local history, theme persistence, compatible share links, keyboard shortcuts, drag-and-drop, and file export
- Installable PWA with offline caching

Live editing uses a 160 ms debounce. Files larger than 1,500,000 characters are analyzed automatically after loading with a blocking progress overlay, while the editor shows a short preview instead of mounting the complete multi-megabyte string. Output settings continue to re-render an already analyzed large document.

## JSON graph

The `Tree / Graph` tabs show two independent views of the source. The graph always represents the original JSON and is not affected by formatter filters or tree selection. Opening the Graph tab does no expensive work: the user starts generation explicitly with **Build graph**.

- Objects, arrays, and primitives use separate node types.
- Edges show object keys or array indexes.
- A single document starts at `$`; NDJSON gets a virtual `Documents` root.
- Node IDs use the document number and an escaped JSON Pointer path.
- String previews are shortened to 80 characters without changing source data.
- Rendering is capped at 1,000 real nodes. Omitted branches are represented by summary nodes and a warning.
- Parsing and Dagre layout run in a Web Worker after the explicit build action, with a blocking progress overlay while it works.
- Editing or replacing the JSON marks the previous graph as stale and requires **Build updated graph**; switching tabs keeps a current graph in transient memory.

## Output formats

| Group | Examples |
| --- | --- |
| Key lists | quoted/bare names, JSON array, JSON Lines, CSV, TSV, count report |
| Paths | dot, bracket, JSONPath, `jq`, JSON Pointer, column names |
| TypeScript & schema | type, interface, flat fields, Zod, JSON Schema |
| Languages | C#, Kotlin, Java, Go, Python, Swift, Rust |
| SQL | column list, `CREATE TABLE` |
| Data | YAML skeleton, dotenv, JSON skeleton |
| Custom | per-key and inline templates |

Optionality and nullability remain distinct in generated declarations.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl`/`⌘` + `K` | Focus JSON input |
| `Ctrl`/`⌘` + `Enter` | Render now |
| `Ctrl`/`⌘` + `Shift` + `C` | Copy output |
| `Ctrl`/`⌘` + `Shift` + `F` | Format input |
| `Ctrl`/`⌘` + `Shift` + `K` | Clear |
| `Ctrl`/`⌘` + `/` | Open shortcut help |

## Architecture

```text
src/
  main.tsx                 React entry point
  App.tsx                  application composition and browser interactions
  components/ui/           shadcn/ui-style primitives
  components/key-tree.tsx  selectable structure tree
  components/json-graph.tsx React Flow graph viewer
  store/app-store.ts       typed Zustand state and persistence boundary
  graph/json-to-graph.ts   pure JSON-to-React-Flow adapter and Dagre layout
  core/                    pure parsing, extraction, paths, naming, and schema
  formats/                 36 pure output formatters and registry
  ui/                      pure UI-facing helpers: history, share, diff, files
  types.ts                 shared domain types
tests/                     Vitest unit and React integration tests
scripts/                   formatter and production-bundle smoke checks
public/                    icon, manifest, and service worker
```

The generation pipeline stays independent of React:

```text
text → parseDocuments → docs → extractAll → fields → buildKeyItems → items
                              └→ buildSchema → schema ───────────────┘
                                                        renderFormat → output
```

The graph adapter is also pure: `jsonToGraph(docs)` returns typed React Flow nodes, edges, counts, and truncation details.

## Persistence and compatibility

The Zustand persist middleware stores only options and theme under `kfj.app.v3`. Input documents, generated output, graph data, and transient UI state are not stored there. On first use, the app imports values from `kfj.options.v2` and `kfj.theme` without deleting them. Existing `kfj.history.v2` entries and share-link payloads remain compatible.

## Testing

The suite contains 139 Vitest tests covering parsing, repair, extraction, schema inference, all formatters, generated shapes, share/history/diff helpers, React interactions, and the graph adapter. `pnpm check:formats` additionally executes all 36 formatters against awkward and mixed documents. After building, `pnpm check:build` imports the minified production bundle in jsdom and verifies the GitHub Pages artifact.

## Deployment

`.github/workflows/deploy.yml` installs pnpm dependencies with `--frozen-lockfile`, runs checks, builds, validates the bundle, and publishes `dist/` to GitHub Pages on pushes to `main`.

## Privacy

Everything is processed locally. Share data lives in the URL fragment, which browsers do not send to the server. The only network requests are for the app's own static assets.

## License

MIT.
