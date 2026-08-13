import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { cn } from '@/lib/cn';

type DropzoneProps = {
  /** Called with the `.chd` files from a drop or selection (non-CHD ignored). */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

/**
 * CHD intake target: drag-and-drop plus a file picker supporting multi-file
 * selection and `webkitdirectory` folder selection (ingesting every `.chd`
 * within the selected folder tree). Non-`.chd` files are filtered out without
 * error, mirroring the CLI's recursive scan.
 */
export function Dropzone({ onFiles, disabled = false }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const handleFileList = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const chdFiles = Array.from(list).filter((f) => f.name.toLowerCase().endsWith('.chd'));
      if (chdFiles.length > 0) onFiles(chdFiles);
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
        hard_drive
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-headline-lg text-on-surface">Drop CHD disc images here</p>
        <p className="text-body-md text-on-surface-variant">
          Multi-file and folder selection supported — only{' '}
          <span className="text-on-surface">.chd</span> files are ingested.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".chd"
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
          Select files
        </button>
        <input
          ref={(el) => {
            // `webkitdirectory` is not part of React's HTML attribute types;
            // set it imperatively so the picker ingests a whole folder tree.
            (folderInputRef as MutableRefObject<HTMLInputElement | null>).current = el;
            if (el && !el.hasAttribute('webkitdirectory')) el.setAttribute('webkitdirectory', '');
          }}
          type="file"
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
          onClick={() => folderInputRef.current?.click()}
          className="btn-ghost rounded-lg px-4 py-2 text-body-md text-on-surface"
        >
          Select folder
        </button>
      </div>
    </div>
  );
}
