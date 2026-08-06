import type { MemorySlotNumber } from '../../memcards/memoryCardManager';

type EmptyCardPaneProps = {
  slot: MemorySlotNumber;
  onMount: () => void;
  onInitialize: () => void;
};

const DOTS =
  "url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiMzMzM1MzUiIGZpbGwtb3BhY2l0eT0iMC40Ii8+PC9zdmc+')";

/** Placeholder shown for an empty slot: the mockup's "Card Library" state. */
export function EmptyCardPane({ slot, onMount, onInitialize }: EmptyCardPaneProps) {
  return (
    <section
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-outline-variant bg-surface-container p-10"
      style={{ backgroundImage: DOTS }}
    >
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-outline-variant bg-surface">
        <span className="material-symbols-outlined text-[40px] text-outline" aria-hidden="true">
          library_add
        </span>
      </div>
      <h3 className="mb-2 font-semibold text-on-surface">Card Library</h3>
      <p className="mb-7 max-w-xs text-center text-on-surface-variant">
        Slot {slot} is empty. Mount a card from your library into this slot or initialize a new
        storage module.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-2.5">
        <button
          type="button"
          onClick={onMount}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            upload_file
          </span>
          Mount Existing Card
        </button>
        <button
          type="button"
          onClick={onInitialize}
          className="flex items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-variant px-6 py-2.5 font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            add_circle
          </span>
          Initialize New Card
        </button>
      </div>
    </section>
  );
}
