import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/pb-auth';
import { fileUrl } from '@/lib/pb-files';
import { useAuthStore } from './store';
import { cn } from '@/lib/cn';

export function AccountMenu() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!user) return null;

  const avatar = user.avatar
    ? fileUrl({ collectionId: '_pb_users_auth_', id: user.id }, user.avatar)
    : null;

  const displayName = user.name || user.email;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 p-1 rounded-full',
          'hover:bg-surface-variant/50 active:scale-95 transition-transform group',
        )}
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="w-9 h-9 rounded-full object-cover border border-white/10"
          />
        ) : (
          <span
            className={cn(
              'w-9 h-9 rounded-full bg-surface-container-high border border-white/10',
              'flex items-center justify-center text-on-surface font-semibold',
            )}
            aria-hidden="true"
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-12 w-64 z-50',
            'glass-panel rounded-xl ambient-shadow border border-white/10',
            'flex flex-col p-2',
          )}
        >
          <div className="px-3 py-3 border-b border-white/5">
            <p className="text-white font-semibold text-body-md truncate">
              {user.name ?? 'Player'}
            </p>
            <p className="text-on-surface-variant text-body-md truncate">{user.email}</p>
          </div>
          <a
            href="/admin.html"
            role="menuitem"
            className={cn(
              'mt-1 flex items-center gap-2 px-3 py-2 rounded-lg',
              'text-on-surface hover:bg-white/5 transition-colors text-body-md text-left',
            )}
          >
            <span className="material-symbols-outlined text-on-surface-variant">
              admin_panel_settings
            </span>
            Admin
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void auth.signOut();
            }}
            className={cn(
              'mt-1 flex items-center gap-2 px-3 py-2 rounded-lg',
              'text-on-surface hover:bg-white/5 transition-colors text-body-md text-left',
            )}
          >
            <span className="material-symbols-outlined text-on-surface-variant">logout</span>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
