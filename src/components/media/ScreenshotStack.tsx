import { useState } from 'react';
import { fileUrl } from '@/lib/pb-files';
import { cn } from '@/lib/cn';
import { Lightbox } from './Lightbox';

export type ScreenshotStackProps = {
  screenshots: string[];
  record: { collectionId: string; id: string };
};

export function ScreenshotStack({ screenshots, record }: ScreenshotStackProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const images = screenshots.map((s) => fileUrl(record, s));

  return (
    <>
      <div className="flex flex-col gap-3">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className={cn(
              'relative rounded-xl overflow-hidden ambient-shadow card-hover-effect',
              'aspect-video cursor-pointer border border-white/5',
              'group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            )}
            aria-label={`Open screenshot ${i + 1} of ${images.length}`}
          >
            <img
              src={src}
              alt={`Screenshot ${i + 1}`}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300" />
          </button>
        ))}
      </div>

      <Lightbox
        open={lightboxIndex !== null}
        images={images}
        index={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={(i) => setLightboxIndex(i)}
      />
    </>
  );
}
