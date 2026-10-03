/**
 * Verify the shipped artifact.
 *
 * Loads the real `dist/index.html`, installs the DOM globals, then imports the
 * built (bundled and minified) JavaScript and drives it. This is the only check
 * that runs what actually gets deployed: it catches build-level problems the
 * source tests cannot see — a side effect removed by tree shaking, a constant that
 * only breaks after minification, an `import.meta` value replaced at build time.
 *
 * Run `npm run build` first, then `npm run check:build`.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const distDirectory = new URL('../dist/', import.meta.url);
const indexPath = new URL('index.html', distDirectory);

if (!existsSync(indexPath)) {
  console.error('dist/index.html is missing — run `npm run build` first.');
  process.exitCode = 1;
} else {
  await verify();
}

async function verify() {
  const html = readFileSync(indexPath, 'utf8');
  const assetsDirectory = new URL('assets/', distDirectory);
  const bundleName = readdirSync(assetsDirectory).find(
    (name) => name.endsWith('.js') && !name.endsWith('.map'),
  );

  if (!bundleName) {
    console.error('No built JavaScript found under dist/assets — run `npm run build` first.');
    process.exitCode = 1;
    return;
  }
  const bundleUrl = new URL(bundleName, assetsDirectory);

  const dom = new JSDOM(html, { url: 'https://example.test/', pretendToBeVisual: true });
  const { window } = dom;

  // jsdom has neither, and the app is written to tolerate both.
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
    // Vite's module-preload polyfill, bundled into the entry, constructs one.
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    localStorage: window.localStorage,
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });

  await import(bundleUrl.href);

  const $ = (id) => window.document.getElementById(id);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

  const failures = [];
  const check = (label, condition) => {
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}`);
    if (!condition) failures.push(label);
  };

  check('the bundle evaluates and prefills a sample', $('jsonInput').value.length > 0);
  check('the default format renders keys', /^"id",\n"created_at",/.test($('output').textContent));
  check('the format picker is populated', $('formatSelect').options.length >= 36);
  check('the wrapper presets are populated', $('wrapperPreset').options.length >= 16);
  check('the options selects are populated', $('caseMode').options.length >= 9 && $('separator').options.length >= 7);
  check('the key tree rendered', $('treeHost').querySelectorAll('input[type="checkbox"]').length > 0);
  check('valid input shows no error banner', $('errorBanner').hidden === true);

  $('formatSelect').value = 'ts-type';
  $('formatSelect').dispatchEvent(new window.Event('change', { bubbles: true }));
  await settle();
  check('switching format re-renders', /export type Root = \{/.test($('output').textContent));

  $('jsonInput').value = '{a: 1,}';
  $('jsonInput').dispatchEvent(new window.Event('input', { bubbles: true }));
  await settle();
  check('invalid input raises the error banner', $('errorBanner').hidden === false);
  check('a recoverable mistake offers Repair', $('repairBtn').hidden === false);

  console.log(`\nbundle: ${bundleName} (${readFileSync(bundleUrl).length} bytes)`);
  if (failures.length > 0) {
    console.error(`${failures.length} failure(s) in the production bundle`);
    process.exitCode = 1;
  } else {
    console.log('the production bundle works end to end');
  }
}
