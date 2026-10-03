/**
 * Markup/controller consistency check.
 *
 * Every element the controller looks up by id must exist in `index.html`, every
 * `label[for]` must point at a real control, and every attribute selector used in
 * the controller must appear in the markup. A typo in any of these is a blank or
 * half-dead page at runtime, and nothing else catches it without a browser.
 *
 * Run with `npm run check:dom`.
 */

import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const app = readFileSync(new URL('src/ui/app.js', root), 'utf8');
const toast = readFileSync(new URL('src/ui/toast.js', root), 'utf8');

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));

const lookups = new Map();
for (const [file, source] of [
  ['src/ui/app.js', app],
  ['src/ui/toast.js', toast],
]) {
  for (const match of source.matchAll(/\bbyId\('([^']+)'\)/g)) lookups.set(match[1], file);
}

const missing = [...lookups.keys()].filter((id) => !htmlIds.has(id));
const unused = [...htmlIds].filter((id) => !lookups.has(id));

// Ids created dynamically at runtime are expected to have no markup counterpart.
const RUNTIME_IDS = new Set(['shortcutsModal', 'clearHistoryBtn', 'historyBtn', 'shortcutsBtn', 'shortcutsTitle']);
const unexpectedUnused = unused.filter((id) => !RUNTIME_IDS.has(id));

const selectorProblems = [];
for (const match of app.matchAll(/querySelector(?:All)?\('\[([a-z-]+)[^\]]*\]'\)/g)) {
  const attribute = match[1];
  if (!new RegExp(`\\b${attribute}=`).test(html)) {
    selectorProblems.push(`[${attribute}] is selected in the controller but never appears in index.html`);
  }
}

const brokenLabels = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((id) => !htmlIds.has(id));

console.log(`markup ids: ${htmlIds.size}, controller lookups: ${lookups.size}`);
console.log(missing.length ? `MISSING: ${missing.join(', ')}` : 'every byId() lookup resolves');
console.log(
  unexpectedUnused.length ? `UNUSED MARKUP IDS: ${unexpectedUnused.join(', ')}` : 'no unused markup ids',
);
console.log(selectorProblems.length ? `SELECTORS:\n  ${selectorProblems.join('\n  ')}` : 'attribute selectors resolve');
console.log(brokenLabels.length ? `BROKEN label[for]: ${brokenLabels.join(', ')}` : 'every label[for] resolves');

if (missing.length || selectorProblems.length || brokenLabels.length || unexpectedUnused.length) {
  process.exitCode = 1;
}
