/**
 * Shareable links.
 *
 * The whole state — input text plus options — is packed into the URL fragment.
 * A fragment never reaches a server, which is what makes this compatible with
 * "nothing leaves this tab": the link works, and no request carries the payload.
 *
 * The payload is deflate-compressed with the platform `CompressionStream` when
 * available, then base64url-encoded. A one-character prefix records which
 * encoding was used so old links keep opening.
 */

import type { AppOptions } from './state.js';

export interface SharedPayload { input: string; options: Partial<AppOptions>; formatId: string }
export interface DecodeResult { payload: SharedPayload | null; error: string | null }

const PREFIX_DEFLATE = '1';
const PREFIX_PLAIN = '0';

/** How much input is allowed into a link. Beyond this, browsers and chat apps mangle URLs. */
export const MAX_SHARE_LENGTH = 200_000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deflate(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes).buffer;
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const hasCompression = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/**
 * Encode state into a fragment string.
 *
 * @param {{input: string, options: object, formatId: string}} payload
 * @returns {Promise<{fragment: string, error: string|null}>}
 */
export async function encodeState(payload: SharedPayload): Promise<{ fragment: string; error: string | null }> {
  const json = JSON.stringify(payload);
  if (json.length > MAX_SHARE_LENGTH) {
    return { fragment: '', error: 'The input is too large to fit in a link — use Save instead.' };
  }

  if (hasCompression) {
    try {
      const bytes = await deflate(json);
      const encoded = toBase64Url(bytes);
      // Only prefer compression when it actually wins.
      if (encoded.length < json.length) return { fragment: `${PREFIX_DEFLATE}${encoded}`, error: null };
    } catch {
      // Fall through to the plain encoding.
    }
  }

  return { fragment: `${PREFIX_PLAIN}${toBase64Url(new TextEncoder().encode(json))}`, error: null };
}

/**
 * Decode a fragment produced by {@link encodeState}.
 *
 * @param {string} fragment
 * @returns {Promise<{payload: object|null, error: string|null}>}
 */
export async function decodeState(fragment: string): Promise<DecodeResult> {
  const text = String(fragment || '').replace(/^#/, '');
  if (!text) return { payload: null, error: null };

  const prefix = text[0];
  const body = text.slice(1);
  try {
    if (prefix === PREFIX_DEFLATE) {
      if (!hasCompression) return { payload: null, error: 'This link needs a browser with DecompressionStream.' };
      const json = await inflate(fromBase64Url(body));
      return { payload: JSON.parse(json) as SharedPayload, error: null };
    }
    if (prefix === PREFIX_PLAIN) {
      const json = new TextDecoder().decode(fromBase64Url(body));
      return { payload: JSON.parse(json) as SharedPayload, error: null };
    }
    return { payload: null, error: null };
  } catch (error) {
    return { payload: null, error: `Could not read the shared state: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Build the full URL for the current state. */
export async function buildShareUrl(state: SharedPayload): Promise<{ url: string; error: string | null }> {
  const { fragment, error } = await encodeState(state);
  if (error) return { url: '', error };
  const { origin, pathname, search } = window.location;
  return { url: `${origin}${pathname}${search}#${fragment}`, error: null };
}

/** Read the shared state from the current location, if there is one. */
export function readLocationState(): Promise<DecodeResult> {
  return decodeState(window.location.hash);
}

/** Remove the fragment without adding a history entry. */
export function clearLocationState(): void {
  if (!window.location.hash) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}
