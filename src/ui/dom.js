/**
 * Small DOM helpers.
 *
 * Deliberately tiny: the app builds its tree and chips with these so no user
 * data is ever interpolated into `innerHTML`.
 */

/** `document.getElementById`, typed by usage rather than by a generic. */
export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}

/** Optional lookup for elements that may legitimately be absent. */
export function maybeById(id) {
  return document.getElementById(id);
}

/** Add a listener and return a function that removes it. */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Trailing-edge debounce. */
export function debounce(fn, wait = 150) {
  let timer = 0;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/**
 * Create an element.
 *
 * `children` accepts a single node, a string, an array, or nested arrays of them:
 * callers should not have to remember which shape they are holding.
 *
 * @param {string} tag
 * @param {object} [props] `class`, `text`, `html` (only for literals you control),
 *        `dataset`, plus any attribute set with `setAttribute`
 * @param {Node|string|Array} [children]
 */
export function create(tag, props = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = String(value);
    else if (key === 'html') element.innerHTML = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key === 'style') Object.assign(element.style, value);
    else if (key in element) element[key] = value;
    else element.setAttribute(key, String(value));
  }
  const list = Array.isArray(children) ? children.flat(Infinity) : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}

/** Replace an element's children. */
export function replace(node, ...children) {
  node.replaceChildren(
    ...children
      .flat(Infinity)
      .filter((child) => child !== null && child !== undefined && child !== false),
  );
  return node;
}

/** Fill a `<select>` from `{value, label}` options. */
export function fillSelect(select, options, selected) {
  select.replaceChildren(
    ...options.map(({ value, label }) => create('option', { value, text: label, selected: value === selected })),
  );
  if (selected !== undefined) select.value = String(selected);
  return select;
}

/** Render `key: value` stats into a panel footer. */
export function renderStats(host, entries) {
  host.replaceChildren(
    ...entries
      .filter(Boolean)
      .map((entry) => create('span', { class: entry.warn ? 'stat-warn' : '', text: entry.text ?? entry })),
  );
}

/** Format a byte count for humans. */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Compact relative time, e.g. "4 min ago". */
export function relativeTime(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
