import { useEffect, useRef } from 'react';
import { decodeIconFrame, ICON_HEIGHT, ICON_WIDTH, iconFrameDelayMs } from 'mcrreader';
import type { SaveIcon as SaveIconData } from 'mcrreader';
import { cn } from '@/lib/cn';

type SaveIconProps = {
  icon: SaveIconData;
  alt?: string;
  className?: string;
};

/**
 * Render a PS1 memory-card save icon (16×16, up to 3 animated frames) onto a
 * pixelated canvas. Port of the mcrreader viewer's icon loop.
 */
export function SaveIcon({ icon, alt, className }: SaveIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let frame = 0;
    let elapsed = 0;
    let last = performance.now();

    const draw = (f: number) => {
      const rgba = decodeIconFrame(icon, f);
      const image = new ImageData(ICON_WIDTH, ICON_HEIGHT);
      image.data.set(rgba);
      ctx.putImageData(image, 0, 0);
    };
    draw(0);
    ctx.imageSmoothingEnabled = false;

    const delay = iconFrameDelayMs(icon.frames);
    if (icon.frames <= 1 || !Number.isFinite(delay)) return;

    const loop = (now: number) => {
      elapsed += now - last;
      last = now;
      if (elapsed >= delay) {
        const steps = Math.floor(elapsed / delay);
        elapsed -= steps * delay;
        frame = (frame + steps) % icon.frames;
        draw(frame);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [icon]);

  return (
    <canvas
      ref={canvasRef}
      width={ICON_WIDTH}
      height={ICON_HEIGHT}
      role="img"
      aria-label={alt}
      className={cn(
        'w-14 h-14 rounded overflow-hidden shrink-0 [image-rendering:pixelated] ring-1 ring-white/10',
        className,
      )}
    />
  );
}
