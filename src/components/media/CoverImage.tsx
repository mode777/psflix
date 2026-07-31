import { fileUrl } from '@/lib/pb-files';

export type CoverImageProps = {
  record: { collectionId: string; id: string };
  filename?: string;
  alt?: string;
  className?: string;
};

export function CoverImage({ record, filename, alt, className }: CoverImageProps) {
  if (!filename) {
    return (
      <div
        className={'w-full h-full flex items-center justify-center ' + (className ?? '')}
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-6xl opacity-20">image</span>
      </div>
    );
  }
  return (
    <img
      src={fileUrl(record, filename)}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      className={'w-full h-full object-cover ' + (className ?? '')}
    />
  );
}
