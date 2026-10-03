/**
 * Toasts.
 *
 * Hand-rolled rather than Bootstrap's Toast component: it is a dozen lines, needs
 * no JS bundle, and the copy confirmation fires on every copy — the one place
 * where a dependency would be felt on every click.
 */

import { create, byId } from './dom.js';

const DEFAULT_DELAY = 2200;

function host() {
  return byId('toastHost');
}

/**
 * Show a short message.
 *
 * @param {string} message
 * @param {{variant?: 'success'|'danger'|'warning'|'info', delay?: number}} [options]
 */
export function toast(message, options = {}) {
  const { variant = 'info', delay = DEFAULT_DELAY } = options;
  const element = create('div', {
    class: `kfj-toast is-${variant}`,
    role: variant === 'danger' ? 'alert' : 'status',
    text: message,
  });

  host().append(element);
  // Force a reflow so the transition runs from the initial state.
  void element.offsetWidth;
  element.classList.add('is-visible');

  const remove = () => {
    element.classList.remove('is-visible');
    setTimeout(() => element.remove(), 200);
  };

  const timer = setTimeout(remove, delay);
  element.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });

  return remove;
}

/** Copy text, falling back when the Clipboard API is unavailable. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path; some browsers reject without focus.
  }

  try {
    const scratch = create('textarea', {
      value: text,
      style: { position: 'fixed', top: '-1000px', opacity: '0' },
      readonly: true,
    });
    document.body.append(scratch);
    scratch.select();
    const ok = document.execCommand('copy');
    scratch.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Copy with the matching toast, used by every copy button. */
export async function copyWithFeedback(text, what = 'Output') {
  if (!text) {
    toast('Nothing to copy yet', { variant: 'warning' });
    return false;
  }
  const ok = await copyText(text);
  toast(ok ? `${what} copied` : 'Copy failed — select the text and press Ctrl+C', {
    variant: ok ? 'success' : 'danger',
  });
  return ok;
}
