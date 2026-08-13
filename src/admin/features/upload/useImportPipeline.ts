import { useCallback, useEffect, useRef, useState } from 'react';
import { ExtractorClient } from './extractor/extractorClient';
import { fetchGameMetadata, MetadataNotFoundError, type GameMetadata } from './metadata';
import {
  buildReview,
  discIndexInMetadata,
  type DiscItem,
  type GameGroup,
  type FailedItem,
  type PipelineStage,
  type UploadSummary,
} from './pipeline';
import { createGame, findDisc, findGame, type GameRecord } from './catalog';
import { uploadDisc } from './uploadDisc';

export type ImportState = {
  stage: PipelineStage;
  items: DiscItem[];
  games: GameGroup[];
  failed: FailedItem[];
  summary: UploadSummary | null;
};

const INITIAL_STATE: ImportState = {
  stage: 'idle',
  items: [],
  games: [],
  failed: [],
  summary: null,
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function makeItem(id: string, file: File): DiscItem {
  return {
    id,
    file,
    fileName: file.name,
    fileSize: file.size,
    status: 'pending',
    discId: null,
    index: 0,
    metadata: null,
    existingGameId: null,
    existingDisc: false,
    error: null,
    progress: null,
  };
}

/**
 * Single-piece-of-state orchestrator for the ingest pipeline (design.md,
 * Decision 5): intake → identify (worker) + enrich (fetch) + existence-check per
 * file → review (grouped) → sequential upload with progress → done summary.
 *
 * Failures (no disc id / no metadata / per-disc upload error) become individual
 * failed items and never abort the batch. All catalog reads/writes use the
 * shared admin superuser session via the imported modules (Decision 6).
 */
export function useImportPipeline() {
  const [state, setState] = useState<ImportState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const extractorRef = useRef<ExtractorClient | null>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Lazily create (and clean up) the extraction worker only when first needed.
  const getExtractor = useCallback((): ExtractorClient => {
    if (!extractorRef.current) extractorRef.current = new ExtractorClient();
    return extractorRef.current;
  }, []);

  useEffect(() => {
    return () => {
      extractorRef.current?.terminate();
      extractorRef.current = null;
    };
  }, []);

  /**
   * Patch one disc item wherever it lives: the flat `items` list (intake view,
   * review recompute) AND the grouped `games[].discItems` copy (progress view,
   * overall counts). Patching both keeps every render source consistent —
   * without it, upload status changes land only in `items` while the progress
   * panel reads the stale review-time `games` snapshot.
   */
  const updateItem = useCallback((id: string, patch: Partial<DiscItem>) => {
    setState((s) => ({
      ...s,
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      games: s.games.map((g) =>
        g.discItems.some((d) => d.id === id)
          ? { ...g, discItems: g.discItems.map((d) => (d.id === id ? { ...d, ...patch } : d)) }
          : g,
      ),
    }));
  }, []);

  const updateGame = useCallback((serial: string, patch: Partial<GameGroup>) => {
    setState((s) => ({
      ...s,
      games: s.games.map((g) => (g.firstDiscSerial === serial ? { ...g, ...patch } : g)),
    }));
  }, []);

  const processItem = useCallback(
    async (item: DiscItem) => {
      updateItem(item.id, { status: 'identifying' });

      let discId: string | null;
      try {
        discId = await getExtractor().extract(item.file);
      } catch (err) {
        updateItem(item.id, { status: 'failed', error: `Extraction failed: ${errMessage(err)}` });
        return;
      }
      if (!discId) {
        updateItem(item.id, { status: 'failed', error: 'No PS1 disc ID found' });
        return;
      }
      updateItem(item.id, { status: 'identified', discId });

      let metadata: GameMetadata;
      try {
        metadata = await fetchGameMetadata(discId);
      } catch (err) {
        const reason =
          err instanceof MetadataNotFoundError
            ? `No metadata for ${discId}`
            : `Metadata fetch failed: ${errMessage(err)}`;
        updateItem(item.id, { status: 'failed', error: reason });
        return;
      }

      const index = discIndexInMetadata(discId, metadata);

      let existingGameId: string | null = null;
      try {
        const game = await findGame(metadata.firstDiscSerial);
        existingGameId = game?.id ?? null;
      } catch {
        // tolerate — treat as not yet existing
      }

      let existingDisc = false;
      try {
        const disc = await findDisc(discId);
        existingDisc = !!disc;
      } catch {
        // tolerate — treat as not yet existing
      }

      updateItem(item.id, {
        status: existingDisc ? 'exists' : 'ready',
        index,
        metadata,
        existingGameId,
        existingDisc,
      });
    },
    [getExtractor, updateItem],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      const chdFiles = files.filter((f) => f.name.toLowerCase().endsWith('.chd'));
      if (chdFiles.length === 0) return;

      const newItems = chdFiles.map((f) => makeItem(`${Date.now()}-${idCounter.current++}`, f));
      setState((s) => ({
        ...s,
        stage: 'intake',
        items: [...s.items, ...newItems],
        games: [],
        failed: [],
        summary: null,
      }));

      // Identify + enrich + existence-check per file. The worker serializes the
      // WASM extraction internally; enrichment/existence overlap across files.
      await Promise.all(newItems.map((item) => processItem(item)));

      setState((s) => {
        const { games, failed } = buildReview(s.items);
        return { ...s, stage: 'review', games, failed };
      });
    },
    [processItem],
  );

  const recomputeReview = useCallback(() => {
    setState((s) => {
      if (s.stage !== 'review') return s;
      const { games, failed } = buildReview(s.items);
      return { ...s, games, failed };
    });
  }, []);

  const removeItem = useCallback(
    (id: string) => {
      setState((s) => ({ ...s, items: s.items.filter((it) => it.id !== id) }));
      recomputeReview();
    },
    [recomputeReview],
  );

  const removeGame = useCallback(
    (serial: string) => {
      setState((s) => ({
        ...s,
        items: s.items.filter((it) => it.metadata?.firstDiscSerial !== serial),
      }));
      recomputeReview();
    },
    [recomputeReview],
  );

  const startUpload = useCallback(async () => {
    const snapshot = stateRef.current;
    if (snapshot.stage !== 'review') return;

    setState((s) => ({ ...s, stage: 'uploading' }));

    const summary: UploadSummary = {
      gamesCreated: 0,
      gamesReused: 0,
      discsUploaded: 0,
      discsSkipped: 0,
      failed: 0,
    };

    for (const game of snapshot.games) {
      const readyDiscs = game.discItems.filter((d) => d.status === 'ready');
      summary.discsSkipped += game.discItems.filter((d) => d.status === 'exists').length;

      if (readyDiscs.length === 0) continue;

      // Reuse an existing game record if one was found; otherwise create it
      // lazily so a game is only created when at least one disc will upload.
      let gameId = game.createdGameId ?? game.existingGameId;
      if (game.existingGameId) {
        summary.gamesReused += 1;
      }
      if (!gameId) {
        try {
          const record = await createGame(game.metadata);
          gameId = record.id;
          updateGame(game.firstDiscSerial, { status: 'created', createdGameId: gameId });
          summary.gamesCreated += 1;
        } catch (err) {
          // Robustness: the intake-time existence check may have missed an
          // existing game (transient error or a race between review and
          // approval). Retry the lookup before failing the batch — an existing
          // game is reused so its new discs still upload.
          let existing: GameRecord | null = null;
          try {
            existing = await findGame(game.firstDiscSerial);
          } catch {
            existing = null;
          }
          if (existing) {
            gameId = existing.id;
            updateGame(game.firstDiscSerial, { status: 'reused', existingGameId: existing.id });
            summary.gamesReused += 1;
          } else {
            updateGame(game.firstDiscSerial, { status: 'error' });
            for (const disc of readyDiscs) {
              updateItem(disc.id, {
                status: 'error',
                error: `Game creation failed: ${errMessage(err)}`,
              });
              summary.failed += 1;
            }
            continue;
          }
        }
      }

      // Upload this game's discs sequentially (CHDs are large; one at a time).
      for (const disc of readyDiscs) {
        updateItem(disc.id, {
          status: 'uploading',
          progress: { loaded: 0, total: disc.fileSize || 0 },
        });
        try {
          await uploadDisc({
            serial: disc.discId as string,
            index: disc.index,
            gameId: gameId as string,
            iso: disc.file,
            onProgress: (p) =>
              updateItem(disc.id, { progress: { loaded: p.loaded, total: p.total } }),
          });
          updateItem(disc.id, { status: 'uploaded', progress: null });
          summary.discsUploaded += 1;
        } catch (err) {
          // Robustness: the disc may already exist in the catalog (the intake
          // check missed it, or another device uploaded it meanwhile). Re-check
          // and treat an existing disc as skipped rather than failed.
          let alreadyThere = false;
          try {
            alreadyThere = !!(await findDisc(disc.discId as string));
          } catch {
            alreadyThere = false;
          }
          if (alreadyThere) {
            updateItem(disc.id, { status: 'exists', existingDisc: true, progress: null });
            summary.discsSkipped += 1;
          } else {
            // Per-disc failure marks this disc and continues to the next.
            updateItem(disc.id, {
              status: 'error',
              error: `Upload failed: ${errMessage(err)}`,
              progress: null,
            });
            summary.failed += 1;
          }
        }
      }
    }

    // Fold in items that failed during intake (identification / enrichment).
    summary.failed += stateRef.current.failed.length;

    setState((s) => ({ ...s, stage: 'done', summary }));
  }, [updateGame, updateItem]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    addFiles,
    removeItem,
    removeGame,
    startUpload,
    reset,
  };
}
