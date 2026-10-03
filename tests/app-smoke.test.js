/**
 * End-to-end smoke test.
 *
 * Boots the real `index.html` in jsdom and drives the real controller: parse,
 * extract, filter, generate, report errors, repair, select, compare. This is the
 * only layer that catches the class of mistake a static check cannot see — a
 * handler bound to the wrong event, a value read from the wrong control, a render
 * that throws, a constant that was never imported.
 *
 * The app binds to globals at import time, so the DOM has to exist first, and the
 * module is a singleton. That makes this a single-boot file: one boot, then tests
 * that exercise the live app in sequence. Tests that change options reset them
 * first, so a failure cannot cascade into the next test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const DEBOUNCE_WAIT = 300;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Install the globals the app expects, then import and start it. */
async function boot() {
  const dom = new JSDOM(html, { url: 'https://keys.example.test/', pretendToBeVisual: true });
  const { window } = dom;

  // jsdom implements neither of these, and the app is written to tolerate both.
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });

  const globals = {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    localStorage: window.localStorage,
  };

  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  // `navigator` is a read-only accessor on the Node global object.
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });

  const app = await import('../src/ui/app.js');
  await app.start();
  return { window, app, document: window.document };
}

const { window, app, document } = await boot();

const $ = (id) => document.getElementById(id);
const output = () => $('output').textContent;
const fire = (element, type) => element.dispatchEvent(new window.Event(type, { bubbles: true }));

const setInput = (text) => {
  $('jsonInput').value = text;
  app.internals.run();
};

const setControl = (id, value) => {
  const control = $(id);
  if (control.type === 'checkbox') control.checked = value;
  else control.value = value;
  fire(control, 'input');
  fire(control, 'change');
  // Option changes render on a trailing debounce. Driving the run synchronously
  // keeps assertions deterministic instead of timing-dependent; the debounced path
  // itself is covered by the compare-panel test.
  app.internals.run();
};

const setFormat = (id) => setControl('formatSelect', id);
const clickControl = (id) => {
  fire($(id), 'click');
  app.internals.run();
};

/** Put options and the key selection back to their defaults without touching input. */
const resetOptions = () => {
  fire($('resetOptionsBtn'), 'click');
};

/* ------------------------------------------------------------------ */

test('a first visit boots with a sample and renders its keys', () => {
  assert.ok($('jsonInput').value.length > 0, 'the first visit is prefilled with a sample');
  assert.match(output(), /^"id",\n"created_at",/, 'the default format is the quoted key list');
  assert.ok(output().includes('"postcode"'), 'nested keys are included');
  assert.ok(!output().includes('""'), 'no empty key survives');
  assert.ok(!/^\s*,/.test(output()), 'the output never starts with a separator');
});

test('the output format select drives the output', () => {
  setFormat('ts-type');
  assert.match(output(), /export type Root = \{/);
  assert.match(output(), /created_at: string;/);
  assert.match(output(), /export type RootUserAddress = \{/);

  const declared = [...output().matchAll(/^export type (\w+)/gm)].map((match) => match[1]);
  assert.equal(new Set(declared).size, declared.length, 'no nested type is declared twice');

  setFormat('path-jsonpath');
  assert.match(output(), /^\$\.id,/m);
  assert.match(output(), /\$\.items\[\*\]\.sku/);

  setFormat('zod-schema');
  assert.match(output(), /^ {2}id: z\.number\(\),$/m, 'the Zod body is indented one level');
  assert.match(output(), /^ {6}city: z\.string\(\),$/m, 'nesting indents further');

  resetOptions();
  assert.match(output(), /^"id",/);
});

test('the wrapper preset and custom wrapper both apply', () => {
  resetOptions();

  setControl('wrapperPreset', 'brackets');
  assert.match(output(), /^\[id\],/);

  $('wrapperCustomRadio').checked = true;
  fire($('wrapperCustomRadio'), 'change');
  app.internals.run();

  setControl('wrapperLeft', '"');
  assert.match(output(), /^"id"/, 'a character with no pair mirrors itself');

  setControl('wrapperLeft', '[');
  assert.match(output(), /^\[id\]/, 'a bracket is completed rather than repeated');
  assert.equal($('wrapperRight').value, ']', 'the disabled box shows what will be emitted');

  $('wrapperMirror').checked = false;
  fire($('wrapperMirror'), 'change');
  setControl('wrapperRight', '|');
  assert.match(output(), /^\[id\|/, 'an explicit right side is used verbatim');
});

test('filters narrow the output and report what they removed', () => {
  resetOptions();

  setControl('nodeFilter', 'leaf');
  assert.ok(!output().includes('"user"'), 'container keys are filtered out');
  assert.ok(output().includes('"postcode"'), 'leaf keys remain');

  setControl('nodeFilter', 'all');
  setControl('includePattern', '^user');
  assert.ok(output().includes('"user"'));
  assert.ok(!output().includes('"postcode"'), 'the include pattern is applied');
  assert.match($('outputStats').textContent, /matched filters/);

  setControl('includePattern', '(');
  assert.equal($('includeError').hidden, false, 'a broken pattern is reported inline');
  assert.ok(output().includes('"postcode"'), 'a broken pattern does not filter anything out');

  setControl('includePattern', '');
  assert.equal($('includeError').hidden, true);

  setControl('excludePattern', '^user');
  assert.ok(!output().includes('"user"'), 'the exclude pattern is applied');
});

test('case conversion and path output combine', () => {
  resetOptions();
  setInput('{"myUser":{"firstName":"Ada","addressInfo":{"zipCode":1}},"tags":[{"id":1}]}');

  setControl('nameSource', 'path');
  setControl('caseMode', 'snake');

  assert.equal(
    output(),
    '"my_user",\n"my_user.first_name",\n"my_user.address_info",\n"my_user.address_info.zip_code",\n"tags",\n"tags[].id"',
  );

  // The notation used for paths is switchable, and real indices can be kept.
  setControl('pathStyle', 'pointer');
  setControl('realIndices', true);
  assert.equal(
    output(),
    '"/my_user",\n"/my_user/first_name",\n"/my_user/address_info",\n"/my_user/address_info/zip_code",\n"/tags",\n"/tags/0/id"',
  );

  // A path output format always emits raw paths, in its own notation.
  setFormat('path-jq');
  assert.equal(
    output(),
    '.my_user,\n.my_user.first_name,\n.my_user.address_info,\n.my_user.address_info.zip_code,\n.tags,\n.tags[0].id',
  );
});

test('invalid JSON is reported with a location and never renders', () => {
  resetOptions();
  setInput('{\n  "a": 1,\n  "b": ,\n}');

  assert.equal($('errorBanner').hidden, false, 'the error banner is shown');
  assert.match($('errorLocation').textContent, /Line 3, column \d+/);
  assert.ok($('errorSnippet').textContent.includes('^'), 'the snippet carries a caret');
  assert.equal($('repairBtn').hidden, true, 'this mistake is not one we can repair blindly');
  assert.equal(output(), '', 'no output is produced from unparseable input');

  setInput('{"a": 1}');
  assert.equal($('errorBanner').hidden, true, 'the banner clears once the input parses');
  assert.match(output(), /^"a"/);
});

test('a recoverable mistake offers Repair, and Repair fixes it', () => {
  resetOptions();
  setInput('{a: 1,}');

  assert.equal($('errorBanner').hidden, false);
  assert.equal($('repairBtn').hidden, false, 'a trailing comma and an unquoted key are recoverable');

  clickControl('repairBtn');
  assert.equal($('jsonInput').value, '{\n  "a": 1\n}', 'the input is rewritten as valid JSON');
  assert.equal($('errorBanner').hidden, true);
  assert.match(output(), /^"a"/);
});

test('the toolbar formats and minifies the input', () => {
  resetOptions();
  setInput('{"a":{"b":1}}');

  clickControl('formatJsonBtn');
  assert.equal($('jsonInput').value, '{\n  "a": {\n    "b": 1\n  }\n}');

  clickControl('minifyBtn');
  assert.equal($('jsonInput').value, '{"a":{"b":1}}');
});

test('NDJSON input becomes several documents', () => {
  resetOptions();
  setInput('{"a": 1}\n{"b": 2}\n{"a": 3}');

  assert.equal($('errorBanner').hidden, true);
  assert.equal(app.internals.state.docs.length, 3);
  assert.equal(output(), '"a",\n"b"', 'keys are de-duplicated across all three documents');
  assert.match($('inputStats').textContent, /3 documents/);
  assert.match($('inputStats').textContent, /NDJSON/);
});

test('the key tree lists keys and selecting a branch narrows the output', () => {
  resetOptions();
  setInput('{"user":{"id":1,"name":"Ada"},"other":2}');

  const checkboxes = () => [...$('treeHost').querySelectorAll('input[type="checkbox"]')];
  assert.equal(checkboxes().length, 4, 'one checkbox per key path');

  // The `other` node is the last top-level key.
  const other = checkboxes().at(-1);
  other.checked = false;
  fire(other, 'change');
  app.internals.run();

  assert.equal(output(), '"user",\n"id",\n"name"', 'deselecting a branch drops it and keeps the rest');
  assert.match($('selectionBadge').textContent, /paths selected/);

  clickControl('treeAllBtn');
  assert.equal($('selectionBadge').textContent, 'all keys');
  assert.ok(output().includes('"other"'));

  clickControl('treeLeavesBtn');
  assert.equal(output(), '"id",\n"name",\n"other"', 'only leaves remain');

  clickControl('treeNoneBtn');
  assert.equal(output(), '', 'selecting nothing produces nothing');
});

test('a selection that matches a new document falls back to everything', () => {
  resetOptions();
  setInput('{"user":{"id":1},"other":2}');

  const other = [...$('treeHost').querySelectorAll('input[type="checkbox"]')].at(-1);
  other.checked = false;
  fire(other, 'change');
  app.internals.run();
  assert.ok(!output().includes('"other"'));

  // Pasting unrelated JSON must not leave an empty output behind.
  setInput('{"unrelated": 1}');
  assert.equal(output(), '"unrelated"', 'the stale selection is discarded rather than emptying the output');
  assert.equal($('selectionBadge').textContent, 'all keys');
});

test('the compare panel diffs two documents', async () => {
  resetOptions();
  setInput('{"a": 1, "b": {"x": 1}}');
  $('compareInput').value = '{"a": 1, "c": 2}';
  fire($('compareInput'), 'input');
  await wait(DEBOUNCE_WAIT);

  const report = $('compareOutput').textContent;
  assert.match(report, /Union of both documents/);
  assert.match(report, /^\+ c$/m, 'a path only in B is marked +');
  assert.match(report, /^- b$/m, 'a path only in A is marked -');
  assert.match(report, /^ {2}a$/m, 'a shared path is unmarked');

  fire(document.querySelector('[data-compare="only-b"]'), 'click');
  assert.match($('compareOutput').textContent, /only in the second document/);
  assert.ok(!$('compareOutput').textContent.includes('b.x'));

  fire(document.querySelector('[data-compare="intersection"]'), 'click');
  assert.match($('compareOutput').textContent, /present in both documents/);
});

test('the template format renders per-key and summary tokens', () => {
  resetOptions();
  setInput('{"a": 1, "b": "x"}');
  setFormat('custom-template');

  assert.equal($('templateEditor').hidden, false, 'the template editor appears with the format');

  setControl('templateHeader', '// {{count}} keys of {{root}}');
  setControl('template', '{{key}}: {{type}}');
  setControl('templateFooter', '// end');

  assert.equal(output(), '// 2 keys of Root\na: number\nb: string\n// end');

  const chip = [...$('keyTokens').querySelectorAll('.token-chip')].find(
    (button) => button.textContent === '{{path}}',
  );
  assert.ok(chip, 'the token chips are rendered');
  fire(chip, 'click');
  assert.equal($('template').value, '{{key}}: {{type}}{{path}}', 'a chip appends its token');
});

test('large input pauses live rendering instead of freezing', () => {
  resetOptions();
  const huge = `{"big": "${'x'.repeat(1_500_001)}"}`;
  $('jsonInput').value = huge;
  fire($('jsonInput'), 'input');

  assert.equal(app.internals.state.tooLargeForLive, true);
  assert.match($('inputStats').textContent, /live rendering paused/);

  // An explicit run still works.
  app.internals.run();
  assert.match(output(), /^"big"/);
});

test('the theme toggle flips the document attribute', () => {
  const before = document.documentElement.getAttribute('data-bs-theme');
  fire($('themeToggle'), 'click');
  const after = document.documentElement.getAttribute('data-bs-theme');

  assert.notEqual(before, after);
  assert.ok(['light', 'dark'].includes(after));
});

test('keyboard shortcuts drive the toolbar', () => {
  resetOptions();
  setInput('{bad json');
  assert.equal($('errorBanner').hidden, false);

  window.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'K', ctrlKey: true, shiftKey: true, bubbles: true }),
  );
  assert.equal($('jsonInput').value, '', 'Ctrl+Shift+K clears both areas');
  assert.equal(output(), '');
  assert.equal($('errorBanner').hidden, true);

  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  assert.equal(document.activeElement, $('jsonInput'), 'Ctrl+K focuses the input');
});
