import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

/**
 * Persistent admin navigation (design.md, Decision 1). A vertical glassmorphic
 * pane styled with the Obsidian Console tokens: charcoal surface tier, 40px
 * backdrop blur (per DESIGN.md "Navigation / Sidebar"), thin-stroke Material
 * Symbols, and the current area indicated with the primary-blue accent.
 */
const NAV_ENTRIES = [
  { to: '/', label: 'Dashboard', icon: 'space_dashboard', end: true },
  { to: '/upload', label: 'Upload', icon: 'upload_file', end: false },
  { to: '/documents', label: 'Documents', icon: 'menu_book', end: false },
] as const;

export function AdminSidebar() {
  return (
    <aside
      className={cn(
        'sticky top-20 h-[calc(100vh-5rem)] w-52 shrink-0 flex flex-col gap-6',
        'bg-surface-container-lowest/60 backdrop-blur-[40px]',
        'border-r border-white/10 px-3 py-6',
      )}
    >
      <nav className="flex flex-col gap-1" aria-label="Admin areas">
        {NAV_ENTRIES.map((entry) => (
          <NavLink
            key={entry.to}
            to={entry.to}
            end={entry.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-body-md',
                'transition-colors border-l-2 border-transparent',
                isActive
                  ? 'bg-white/10 text-primary border-l-primary'
                  : 'text-on-surface-variant hover:bg-white/5 hover:text-on-surface',
              )
            }
          >
            <span className="material-symbols-outlined text-[20px] leading-none">{entry.icon}</span>
            {entry.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
