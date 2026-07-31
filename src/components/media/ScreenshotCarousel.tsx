import { useCallback, useEffect, useRef, useState } from 'react';
import { fileUrl } from '@/lib/pb-files';
import { cn } from '@/lib/cn';
import { Lightbox } from './Lightbox';

export type ScreenshotCarouselProps = {
  screenshots: string[];
  record: { collectionId: string; id: string };
};

export function ScreenshotCarousel({ screenshots, record }: ScreenshotCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const images = screenshots.map((s) => fileUrl(record, s));

  const scrollBy = useCallback((direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const slide = el.querySelector<HTMLElement>('[data-slide]');
    const delta = (slide?.clientWidth ?? el.clientWidth / 3) + 16;
    el.scrollBy({ left: direction * delta, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target !== el && !el.contains(e.target as Node)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollBy(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollBy(-1);
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [scrollBy]);

  return (
    <>
      <div className="relative group/carousel">
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-black/60 p-2 rounded-full',
            'opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100',
            'transition-opacity border border-white/10 ml-2',
            'hover:bg-black/80',
          )}
        >
          <span className="material-symbols-outlined text-white" aria-hidden="true">
            chevron_left
          </span>
        </button>

        <div
          ref={trackRef}
          tabIndex={0}
          role="region"
          aria-label="Screenshots carousel"
          className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory hide-scrollbar focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
        >
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              data-slide
              onClick={() => setLightboxIndex(i)}
              className={cn(
                'relative rounded-xl overflow-hidden ambient-shadow card-hover-effect',
                'w-1/3 aspect-video snap-center cursor-pointer shrink-0 border border-white/5',
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

        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          className={cn(
            'absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-black/60 p-2 rounded-full',
            'opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100',
            'transition-opacity border border-white/10 mr-2',
            'hover:bg-black/80',
          )}
        >
          <span className="material-symbols-outlined text-white" aria-hidden="true">
            chevron_right
          </span>
        </button>
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
