import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

type DocumentDropzoneProps = {
  /** Called with the `.pdf` files from a drop or selection (non-PDF ignored). */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

/**
 * PDF intake target (design.md, Decision 2): a sibling of the game uploader's
 * CHD `Dropzone`, NOT a generalization of it. Supports drag-and-drop plus a
 * multi-file picker; no `webkitdirectory` folder picker. Non-`.pdf` files are
 * silently filtered out without error (spec: rejected at intake). Reuses the
 * same drag-depth / `dragging` idiom and Obsidian Console classes
 * (`glass-panel`, gradient CTA) as the game dropzone.
 */
export function DocumentDropzone({ onFiles, disabled = false }: DocumentDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const handleFileList = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const pdfFiles = Array.from(list).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      if (pdfFiles.length > 0) onFiles(pdfFiles);
    },
    [onFiles],
  );

  return (
    <div
      className={cn(
        'glass-panel rounded-2xl border transition-colors',
        'flex flex-col items-center justify-center gap-4 p-10 text-center',
        dragging
          ? 'border-primary bg-primary/5'
          : disabled
            ? 'border-white/10 opacity-60'
            : 'border-white/10 border-dashed hover:border-white/25',
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        if (disabled) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (disabled) return;
        handleFileList(e.dataTransfer.files);
      }}
    >
      <span
        className={cn(
          'material-symbols-outlined text-[40px]',
          dragging ? 'text-primary' : 'text-on-surface-variant',
        )}
        aria-hidden="true"
      >
        menu_book
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-headline-lg text-on-surface">Drop PDF manuals &amp; guides here</p>
        <p className="text-body-md text-on-surface-variant">
          Multi-file selection supported — only <span className="text-on-surface">.pdf</span> files
          are ingested.
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFileList(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'rounded-lg px-4 py-2 text-body-md font-medium text-on-primary',
          'bg-gradient-to-br from-inverse-primary to-secondary-container',
          'hover:brightness-110 transition disabled:opacity-50',
        )}
      >
        Select PDF files
      </button>
    </div>
  );
}
