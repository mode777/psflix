type ExtractSuccess = { id: string; discId: string | null };
type ExtractFailure = { id: string; error: string };
type ExtractReply = ExtractSuccess | ExtractFailure;

/**
 * Main-thread facade over the extraction Web Worker.
 *
 * Created once (the worker instantiates the WASM module a single time and
 * reuses it across jobs). `extract()` posts one `{ id, file }` job and resolves
 * with the disc id (or `null` for a non-PS1 blob); a worker-side error rejects.
 * The worker serializes jobs internally, so it is safe to call concurrently.
 */
export class ExtractorClient {
  private readonly worker: Worker;

  private nextId = 0;

  private readonly pending = new Map<string, (reply: ExtractReply) => void>();

  constructor() {
    // Mirror the emulator's worker convention (`new URL(..., import.meta.url)`);
    // Vite detects this and emits the worker as its own chunk.
    this.worker = new Worker(new URL('./extractor.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener('message', this.handleMessage);
  }

  private handleMessage = (event: MessageEvent<ExtractReply>) => {
    const reply = event.data;
    const resolver = this.pending.get(reply.id);
    if (!resolver) return;
    this.pending.delete(reply.id);
    resolver(reply);
  };

  extract(file: File): Promise<string | null> {
    const id = String(this.nextId++);
    return new Promise<string | null>((resolve, reject) => {
      this.pending.set(id, (reply) => {
        if ('error' in reply) {
          reject(new Error(reply.error));
        } else {
          resolve(reply.discId);
        }
      });
      this.worker.postMessage({ id, file });
    });
  }

  terminate(): void {
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.terminate();
    this.pending.clear();
  }
}
