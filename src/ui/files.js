/**
 * File input and output.
 *
 * Reading uses the File API only — no upload, which is the whole point of the
 * "nothing leaves this tab" promise. Downloads are Blob URLs created and revoked
 * locally.
 */

/** File extensions offered per output format, so `Save` produces a sensible name. */
const EXTENSION_BY_FORMAT = {
  'json-array': 'json',
  'json-skeleton': 'json',
  'json-schema': 'schema.json',
  'json-required': 'txt',
  'json-lines': 'ndjson',
  'csv-header': 'csv',
  'tsv-row': 'tsv',
  'ts-type': 'ts',
  'ts-inline': 'ts',
  'ts-interface': 'ts',
  'ts-leaves': 'ts',
  'zod-schema': 'ts',
  'csharp-class': 'cs',
  'kotlin-data': 'kt',
  'java-record': 'java',
  'go-struct': 'go',
  'python-dataclass': 'py',
  'python-typeddict': 'py',
  'swift-struct': 'swift',
  'rust-struct': 'rs',
  'sql-create-table': 'sql',
  'sql-columns': 'sql',
  'yaml-keys': 'yaml',
  'dotenv': 'env',
};

/** A file name for the current format. */
export function suggestedFilename(formatId, typeName = 'keys') {
  const extension = EXTENSION_BY_FORMAT[formatId] ?? 'txt';
  const base = String(typeName || 'keys')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'keys';
  return `${base}.${extension}`;
}

/** Save text as a file, entirely client-side. */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a moment to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Read one File as text. */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsText(file);
  });
}

/**
 * Turn a drop or a multi-file selection into text for the input area.
 *
 * Several files are joined as NDJSON, because that is exactly what a set of
 * separate JSON documents is when you want every key from all of them.
 */
export async function filesToText(files) {
  const list = [...files];
  if (list.length === 0) return { text: '', names: [], error: null };

  try {
    const contents = await Promise.all(list.map(readFile));
    if (contents.length === 1) return { text: contents[0], names: [list[0].name], error: null };

    // Concatenate as JSON Lines so the parser sees several documents.
    const text = contents.map((content) => content.trim()).filter(Boolean).join('\n');
    return { text, names: list.map((file) => file.name), error: null };
  } catch (error) {
    return { text: '', names: [], error: error.message || String(error) };
  }
}

/**
 * Wire drag-and-drop onto an element.
 *
 * `dragenter`/`dragleave` fire for every child element, so a depth counter is the
 * only reliable way to know when the pointer has really left the zone.
 */
export function attachDropZone(element, onFiles) {
  let depth = 0;

  const show = () => element.classList.add('is-dragging');
  const hide = () => {
    depth = 0;
    element.classList.remove('is-dragging');
  };

  element.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    depth += 1;
    show();
  });

  element.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });

  element.addEventListener('dragleave', () => {
    depth -= 1;
    if (depth <= 0) hide();
  });

  element.addEventListener('drop', async (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    hide();
    onFiles(event.dataTransfer.files);
  });

  // Dropping outside the zone would otherwise navigate away from the app.
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());
}
