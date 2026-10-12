import { parseDocuments } from '@/core/json-parse';
import { jsonToGraph } from '@/graph/json-to-graph';
import type { AppOptions } from '@/ui/state';

interface BuildGraphRequest {
  input: string;
  inputMode: AppOptions['inputMode'];
}

type BuildGraphResponse =
  | { ok: true; model: ReturnType<typeof jsonToGraph> }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<BuildGraphRequest>): void => {
  try {
    const parsed = parseDocuments(event.data.input, { mode: event.data.inputMode });
    if (!parsed.ok) {
      self.postMessage({
        ok: false,
        error: `${parsed.error.message} (line ${parsed.error.line}, column ${parsed.error.column})`,
      } satisfies BuildGraphResponse);
      return;
    }
    self.postMessage({ ok: true, model: jsonToGraph(parsed.docs) } satisfies BuildGraphResponse);
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies BuildGraphResponse);
  }
};
