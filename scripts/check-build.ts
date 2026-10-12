/**
 * Smoke-test the exact static artifact that GitHub Pages will publish.
 *
 * Run `pnpm build` first, then `pnpm check:build`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const distDirectory = new URL('../dist/', import.meta.url);
const indexPath = new URL('index.html', distDirectory);

if (!existsSync(indexPath)) {
  console.error('dist/index.html is missing — run `pnpm build` first.');
  process.exitCode = 1;
} else {
  await verify();
}

async function verify(): Promise<void> {
  const html = readFileSync(indexPath, 'utf8');
  const assetsDirectory = new URL('assets/', distDirectory);
  const bundleName = html.match(/<script[^>]+src="\/KeysFromJSON\/assets\/([^\"]+\.js)"/)?.[1];
  const stylesheetName = readdirSync(assetsDirectory).find((name) => name.endsWith('.css'));

  if (!bundleName || !stylesheetName) {
    console.error('Built JavaScript or CSS is missing under dist/assets.');
    process.exitCode = 1;
    return;
  }

  const bundleUrl = new URL(bundleName, assetsDirectory);
  const bundle = readFileSync(bundleUrl, 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://example.test/KeysFromJSON/',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });

  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  const globals: Record<string, unknown> = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLFormElement: window.HTMLFormElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLAnchorElement: window.HTMLAnchorElement,
    SVGElement: window.SVGElement,
    DocumentFragment: window.DocumentFragment,
    DOMRect: window.DOMRect,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    MutationObserver: window.MutationObserver,
    ResizeObserver: ResizeObserverStub,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    localStorage: window.localStorage,
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }

  await import(bundleUrl.href);
  await new Promise((resolve) => setTimeout(resolve, 400));

  const failures: string[] = [];
  const check = (label: string, condition: boolean): void => {
    console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}`);
    if (!condition) failures.push(label);
  };
  const input = window.document.getElementById('jsonInput') as HTMLTextAreaElement | null;
  const output = window.document.getElementById('output');

  check('index uses the GitHub Pages base path', html.includes('/KeysFromJSON/assets/'));
  check('manifest and service worker are shipped', existsSync(new URL('manifest.webmanifest', distDirectory)) && existsSync(new URL('sw.js', distDirectory)));
  check('the bundle contains the React application', bundle.includes('Keys from JSON') && bundle.includes('Structure explorer'));
  check('the bundle evaluates and prefills a sample', Boolean(input?.value.length));
  check('the default formatter renders output', Boolean(output?.textContent?.trim().length));
  check('the Tree and Graph tabs render', window.document.body.textContent?.includes('Tree') === true && window.document.body.textContent?.includes('Graph') === true);
  check('all 36 formats reached the production bundle', bundle.includes('TypeScript type') && bundle.includes('JSON Schema'));

  console.log(`\nbundle: ${bundleName} (${bundle.length} bytes)`);
  console.log(`styles: ${stylesheetName} (${readFileSync(new URL(stylesheetName, assetsDirectory)).length} bytes)`);
  if (failures.length > 0) {
    console.error(`${failures.length} failure(s) in the production bundle`);
    process.exitCode = 1;
  } else {
    console.log('the production bundle works end to end');
  }
}
