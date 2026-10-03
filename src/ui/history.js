/**
 * Recent inputs.
 *
 * Stored in localStorage so a refresh does not lose the payload you were halfway
 * through inspecting. Deliberately capped twice — by entry count and by payload
 * size — because localStorage is a few megabytes shared with everything else on
 * the origin, and a quota error must never break the tool.
 */

import { HISTORY_INPUT_LIMIT, HISTORY_KEY, HISTORY_LIMIT } from './state.js';

/** Read the stored history, newest first. */
export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.input === 'string') : [];
  } catch {
    return [];
  }
}

function persist(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    return true;
  } catch {
    // Quota exceeded: drop the oldest half and try once more rather than give up.
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, Math.ceil(entries.length / 2))));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Add an entry, newest first.
 *
 * Re-selecting the same input moves it to the top instead of duplicating it.
 *
 * @returns {object[]} the new history
 */
export function pushHistory(entry) {
  if (!entry.input || !entry.input.trim()) return loadHistory();
  if (entry.input.length > HISTORY_INPUT_LIMIT) return loadHistory();

  const existing = loadHistory();
  const withoutDuplicate = existing.filter((item) => item.input !== entry.input);
  const next = [{ ...entry, at: Date.now() }, ...withoutDuplicate].slice(0, HISTORY_LIMIT);
  persist(next);
  return next;
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* nothing to do */
  }
  return [];
}
