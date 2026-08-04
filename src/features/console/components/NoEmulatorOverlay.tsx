import { cn } from '@/lib/cn';

type NoEmulatorOverlayProps = {
  title: string;
  backdropUrl?: string;
  className?: string;
};

export function NoEmulatorOverlay({ title, backdropUrl, className }: NoEmulatorOverlayProps) {
  return (
    <div
      className={cn('absolute inset-0 flex items-center justify-center overflow-hidden', className)}
    >
      {backdropUrl && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${backdropUrl})`, filter: 'blur(24px) brightness(0.5)' }}
        />
      )}
      <div className="relative z-10 flex flex-col items-center gap-3 text-center px-6">
        <span
          className="material-symbols-outlined text-white/30"
          style={{ fontSize: '64px' }}
          aria-hidden="true"
        >
          videogame_asset
        </span>
        <p className="text-white/40 font-body-md text-sm uppercase tracking-widest font-semibold">
          No emulator connected
        </p>
        <p className="text-white/20 font-body-md text-xs max-w-md">
          {title} would render here once a PS1 core is wired in. This is a mock console session.
        </p>
      </div>
    </div>
  );
}
