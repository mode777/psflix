import { fileUrl } from '@/lib/pb-files';
import { cn } from '@/lib/cn';
import type { DocumentsResponse } from '@/types/pocketbase';

export type DocumentTileProps = {
  document: DocumentsResponse;
  kind: 'manual' | 'guide';
};

const ICON: Record<DocumentTileProps['kind'], string> = {
  manual: 'auto_stories',
  guide: 'map',
};

const LABEL: Record<DocumentTileProps['kind'], string> = {
  manual: 'Digital Manual',
  guide: 'Strategy Guide',
};

const ICON_COLOR: Record<DocumentTileProps['kind'], string> = {
  manual: 'text-primary',
  guide: 'text-secondary-container',
};

export function DocumentTile({ document, kind }: DocumentTileProps) {
  if (!document.file) return null;
  const href = fileUrl(document, document.file);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'glass-panel rounded-xl p-4 flex flex-col items-center justify-center',
        'text-center group transition-all duration-300 h-full gap-2',
        'card-hover-effect',
      )}
    >
      <span
        className={cn(
          'material-symbols-outlined text-3xl group-hover:scale-110 transition-transform',
          ICON_COLOR[kind],
        )}
        aria-hidden="true"
      >
        {ICON[kind]}
      </span>
      <span className="font-body-md text-body-md text-white font-semibold">{LABEL[kind]}</span>
    </a>
  );
}
