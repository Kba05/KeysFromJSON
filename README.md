# Keys from JSON

Pull every key out of a JSON document and turn it into the code you actually need — a quoted
list, a set of key paths, a TypeScript type, SQL columns, a language model class, or whatever
your own template says.

It is a single static page. Parsing, schema inference and code generation all run in the tab;
there is no server, no upload, no account and no analytics.

```
{
  "user": { "id": 1, "address": { "city": "London" } },
  "items": [{ "sku": "A-1", "qty": 2 }],
  "tags": ["a", "b"]
}
```

becomes

```ts
export type Root = {
  user: RootUser;
  items: RootItemsItem[];
  tags: string[];
};

export type RootUser = {
  id: number;
  address: RootUserAddress;
};

export type RootUserAddress = {
  city: string;
};

export type RootItemsItem = {
  sku: string;
  qty: number;
};
```

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm test         # node --test tests/
```

The build output is plain static files — open `dist/index.html` from any static host, or use
`npm run preview`.

## Output formats

36 formats, grouped in the picker.

| Group | Formats |
| --- | --- |
| Key lists | quoted key list, bare names, JSON array, JSON Lines, CSV header, TSV row, count report |
| Key paths | `dot`, `dot[index]`, `["bracket"]`, JSONPath, `jq`, JSON Pointer (RFC 6901), `column_name` |
| TypeScript & schemas | `type` (nested types extracted), inline `type`, `interface`, flat leaf fields, Zod schema |
| Other languages | C# class, Kotlin data class, Java record, Go struct, Python dataclass, Python `TypedDict`, Swift struct, Rust struct |
| SQL | column list, `CREATE TABLE` with inferred types |
| Data formats | YAML key skeleton, dotenv lines, JSON skeleton, JSON Schema (2020-12), required/optional split |
| Other | custom template (per-key), custom template (inline) |

Every generator that produces declarations keeps optional and nullable separate: a key that is
missing from some array elements becomes `?` / `Optional` / `Option`, a key whose value can be
`null` becomes `| null` / `?` / `Option`, and a key that is both gets both.

## Input modes

| Mode | Behaviour |
| --- | --- |
| Auto-detect | Tries JSON, then NDJSON. The default. |
| JSON only | Strict JSON. A parse failure is reported, never guessed at. |
| NDJSON / JSON Lines | One document per non-empty line; every line becomes a document. |
| Relaxed input | Also accepts `//` and `/* */` comments, single-quoted strings, unquoted keys, trailing commas, `NaN` and `Infinity`. |

When strict parsing fails, the error names the reason, the line, the column and shows a caret
under the exact character, plus a **Repair** button when the input is one of the recoverable
mistakes. This is done with a hand-written parser rather than `JSON.parse`'s message, because
V8 only reports a position some of the time — `{"a": 1, "b": ,}` comes back as
`Unexpected token ',', ...` with no location at all.

## Options

- **Key wrapper** — 16 presets (`"…"`, `'…'`, `‹…›`, `«…»`, `❝…❞`, `[…]`, `{…}`, `` `…` ``,
  `{{…}}`, `${…}`, `#…#`, `<!--…-->`, …) or a custom left/right pair, with optional mirroring.
- **Name source** — the key name, or the full path.
- **Case** — keep as-is, `camelCase`, `PascalCase`, `snake_case`, `CONSTANT_CASE`, `kebab-case`,
  `dot.case`, lowercase, UPPERCASE. Applied per path segment.
- **Separator** — comma + space, comma + newline, comma + newline with a leading comma (the
  original tool's style), one per line, space, semicolon, pipe.
- **Sort** — document order, A→Z, Z→A, shallow first, deep first, shortest first.
- **Paths** — the notation used for `Name source: path`, path output formats and the template
  `{{path}}` token. Real array indices can be shown (`list[0].name`) or normalised (`list[].name`).
- **Filtering** — all keys / leaf keys only / objects and arrays only, a depth limit, de-duplication
  by name, by path or off (with optional case-insensitivity).
- **Search & patterns** — a substring filter, plus include and exclude regular expressions.
  Invalid patterns are reported inline instead of throwing.
- **Generated code** — the root type / table name, indent, typed JSON skeleton placeholders, and
  `readonly` / `export` for TypeScript.

### Key tree

The tree lists every key path with tri-state checkboxes, so the output can be narrowed to a
subset instead of being all-or-nothing. Selection is keyed by path, not by record, which means
it survives edits to the JSON. `All`, `None`, `Leaves` and `Select matches` are one click each.

### Comparing two documents

Paste a second document to get the **union**, the **shared** paths, or what exists **only in A**
or **only in B** — useful for a v1/v2 response diff or a staging/production config check.

### Sharing and history

**Link** packs the input and every option into the URL fragment and copies it. A fragment never
reaches a server, which is what keeps this compatible with "nothing leaves this tab". Recent
inputs are also kept in `localStorage` (15 entries, ≤60 kB each) and offered from the **History**
menu.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl`/`⌘` + `K` | Focus the JSON input |
| `Ctrl`/`⌘` + `Enter` | Render now (it also renders as you type) |
| `Ctrl`/`⌘` + `Shift` + `C` | Copy the output |
| `Ctrl`/`⌘` + `Shift` + `F` | Format the input |
| `Ctrl`/`⌘` + `Shift` + `K` | Clear both areas |
| `Ctrl`/`⌘` + `/` | Shortcut help |

## Architecture

```
index.html              markup only; every control the controller looks up lives here
src/
  main.js               entry: imports Bootstrap CSS, app CSS, starts the app
  samples.js            sample documents, each one exercising a different behaviour
  core/                 pure, DOM-free, fully unit-tested
    json-parse.js         strict + relaxed parsing, diagnostics, NDJSON, repair
    extract.js            JSON → flat list of key records
    schema.js             JSON → merged type tree (unions, optionality, nullability)
    keypath.js            path notation rendering
    naming.js             word splitting, case conversion, quoting, escaping
    decorate.js           filtering, de-duplication, sorting, wrapping → final name list
  formats/              one pure function per output format
    index.js              the registry; add a format by exporting it from a module
    helpers.js  typescript.js  zod.js  code-langs.js  sql.js
    yaml.js  json.js  list.js  paths.js  template.js
  ui/
    app.js                controller: state, events, rendering
    state.js              defaults, persistence, UI options → engine options
    tree.js  diff.js  share.js  history.js  files.js  toast.js  presets.js  dom.js
  styles/app.css
tests/                  node:test suites for core, formats, generated shapes,
                        plus a jsdom end-to-end smoke test of the whole app
scripts/                static checks that need no browser (see Testing)
public/                 icon, web app manifest, service worker
```

Data flow, one direction only:

```
text ──parseDocuments──▶ docs ──extractAll──▶ fields ──buildKeyItems──▶ items
                                  │                                      │
                                  └──buildSchema──▶ schema ──renderFormat─┘──▶ output
```

The core knows nothing about the DOM; the UI knows nothing about generation. That is what makes
the interesting half of the app testable in Node with no browser.

## Adding an output format

1. Write a pure `run(ctx)` in one of the `src/formats/*.js` modules. `ctx` is
   `{ fields, items, stats, docs, schema, options }`.
2. Add `{ id, label, group, hint, schema?, run }` to that module's exported array. Set
   `schema: true` when the format needs the schema tree rather than only the key list.
3. Nothing else changes — the picker, the file extension map and the tests pick it up from the
   registry.

## Testing

```bash
npm test               # node --test tests/          — 130 tests
npm run check          # tests + formatter registry check + markup/controller check
npm run check:formats  # run all 36 formatters over awkward documents
npm run check:dom      # every byId()/selector/label resolves against index.html
npm run check:build    # boot the built bundle and drive it (run a build first)
npm run test:fast      # the same suite in one process (see below)
```

The core and the formatter suites use Node's built-in runner and no test framework; the core and
the formatters are plain ES modules with no transform step, so there is nothing for a bundler to do
and nothing extra to keep up to date.

`tests/app-smoke.test.js` is the end-to-end layer: it boots the real `index.html` in jsdom and
drives the real controller — paste, parse, filter, switch format, break the regex, hit Repair,
deselect a tree branch, diff two documents, pause live rendering on a huge paste, press a shortcut.
It exists because three genuine bugs were invisible to every other check: a constant used but never
imported, a DOM helper that only accepted an array of children, and a stale tree selection that
silently emptied the output. It is the only test that runs the app rather than its parts.

The two checks in `scripts/` cover what even that cannot. `check:formats` runs every formatter over
documents built to be awkward — arrays of objects whose keys disagree, primitives and strings in
arrays, nulls, empty containers, nested arrays, mixed primitive types — and fails on a thrown error,
empty output, or a generator that declares the same nested type twice. `check:dom` proves every
element, attribute selector and `label[for]` the controller depends on still exists in the markup.

`check:build` closes the last gap: it boots the real `dist/index.html` in jsdom and imports the
bundled, minified JavaScript, so the artifact CI is about to publish is exercised rather than the
source it was built from.

Everything runs in CI before the build is published, and none of it needs a browser download.

`node --test tests/` runs each file in its own child process. In a locked-down environment that
forbids child processes with piped stdio (some Windows sandboxes, for instance), use
`npm run test:fast`, which runs the same files in-process.

## Deployment

`.github/workflows/deploy.yml` runs the tests, builds, and publishes `dist/` to GitHub Pages on
every push to `main`. The production `base` is `/KeysFromJSON/` in `vite.config.js` — change it if
you fork the repository under a different name.

Because Bootstrap is imported from `node_modules` rather than a CDN and a service worker caches
the shell, the deployed app also works offline and can be installed as a desktop app.

## Privacy

Everything is client-side. The only network requests are for the app's own assets. Nothing is
uploaded, nothing is logged, and the optional share link keeps its payload in the URL fragment,
which browsers never send to a server.

## What changed from the original version

The first version was two files and worked for simple input. Along the way it had defects worth
naming, because the regression suite exists to keep them fixed:

| Was | Is |
| --- | --- |
| `JSON.parse` in a click handler, so invalid input failed silently | Parse errors with the reason, line, column, a caret snippet and a one-click repair |
| `for…in` over strings leaked array indices as keys (`["a","b"]` → `"0"`, `"1"`) | Arrays contribute the keys of their elements and nothing else |
| Primitive array items produced `''`, so output could start with a stray `, ` | Empty keys are impossible; the tree and list show only real keys |
| De-duplication ran per recursion branch, so repeated keys survived | One global de-duplication pass, by name or by path, in document order |
| Children were emitted before their parent | Parent before children, in document order |
| Custom wrappers were symmetric only, and stored as a space-split string | Real left/right wrapper pairs, 16 presets, mirror toggle |
| Switching the wrapper radio reset the other control's value | Both choices are preserved |
| `document.execCommand('copy')`, no feedback | `navigator.clipboard` with a fallback and a confirmation toast |
| Bootstrap's JS bundle loaded but unused, everything from a CDN, no offline support | Only the components used, self-hosted, service worker, installable |
| `col-3 / col-4 / col-5`, cramped on mobile | Responsive layout, sticky panels, dark theme, print styles |
| `title` was "Bootstrap demo", textareas had no labels | Real title and metadata, `<label>`/`aria-live`/`role="alert"` throughout |

## License

MIT.
