/// <reference lib="webworker" />
import { extractDiscId } from './loadExtractor';

/**
 * Extraction Web Worker.
 *
 * Receives `{ id, file }` jobs and responds with `{ id, discId }` (discId may be
 * `null` for a non-PS1 blob) or `{ id, error }`. Jobs are serialized through an
 * internal queue so the WASM extractor only ever holds one whole CHD buffer on
 * its heap at a time (mitigates worker/WASM heap pressure on very large CHDs,
 * per design.md "Risks / Trade-offs").
 */
type ExtractRequest = { id: string; file: File };
type ExtractSuccess = { id: string; discId: string | null };
type ExtractFailure = { id: string; error: string };

const queue: ExtractRequest[] = [];
let processing = false;

self.onmessage = (event: MessageEvent<ExtractRequest>) => {
  queue.push(event.data);
  void processQueue();
};

async function processQueue(): Promise<void> {
  if (processing || queue.length === 0) return;
  processing = true;
  const job = queue.shift()!;

  let reply: ExtractSuccess | ExtractFailure;
  try {
    const buffer = await job.file.arrayBuffer();
    const discId = await extractDiscId(buffer);
    reply = { id: job.id, discId };
  } catch (err) {
    reply = {
      id: job.id,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  self.postMessage(reply);
  processing = false;
  void processQueue();
}
