import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { cn } from '@/lib/cn';
import psLogo from '@/assets/playstation-logo.webp';
import { adminAuth } from '@/admin/lib/pb-auth';
import { useAdminAuthStore } from '@/admin/features/auth/store';
import { SignInView } from '@/admin/features/auth/SignInView';
import { DashboardView } from '@/admin/features/dashboard/DashboardView';
import { UploadView } from '@/admin/features/upload/UploadView';
import { AdminSidebar } from '@/admin/components/AdminSidebar';
import { fetchCount } from '@/admin/features/dashboard/api';

type BootState = 'validating' | 'ready';

/**
 * Admin app shell. Owns its own chrome (a separate admin header — the end-user
 * `Header` is deliberately NOT mounted here), the superuser auth gate, and boot
 * validation of any stored token. Uses `HashRouter` (mounted in `main.tsx`) so
 * every route resolves to `admin.html` without server-side rewrites.
 *
 * The shell is a persistent sidebar layout (Decision 1 of the game-uploader
 * design): `<AdminSidebar>` stays mounted across admin areas while a
 * `<Routes>`/content region hosts the Dashboard (`/`) and Upload (`/upload`).
 */
export function AdminApp() {
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);
  const user = useAdminAuthStore((s) => s.user);
  const [boot, setBoot] = useState<BootState>('validating');

  // Boot validation: if a stored token is present, probe it with a cheap
  // authenticated request. On failure, clear the admin store and show sign-in
  // (covers reload-persists-valid + expired-requires-reauth).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!adminAuth.isAuthenticated()) {
        if (!cancelled) setBoot('ready');
        return;
      }
      try {
        await fetchCount('games');
        if (!cancelled) setBoot('ready');
      } catch {
        await adminAuth.signOut();
        if (!cancelled) setBoot('ready');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot === 'validating') {
    return (
      <div className="min-h-screen flex items-center justify-center text-on-surface-variant animate-pulse">
        Checking session…
      </div>
    );
  }

  // Auth gate: unauthenticated state renders sign-in only and fetches no
  // dashboard data.
  if (!isAuthenticated) return <SignInView />;

  return (
    <div className="min-h-screen flex flex-col">
      <AdminHeader email={user?.email} onSignOut={() => void adminAuth.signOut()} />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 min-w-0">
          <Routes>
            <Route path="/" element={<DashboardView />} />
            <Route path="/upload" element={<UploadView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

type AdminHeaderProps = {
  email?: string;
  onSignOut: () => void;
};

function AdminHeader({ email, onSignOut }: AdminHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 bg-background/80 backdrop-blur-xl',
        'border-b border-white/10 h-20',
      )}
    >
      <div className="max-w-container-max mx-auto flex justify-between items-center px-margin-mobile md:px-margin-desktop h-full">
        <div className="flex items-center gap-2.5">
          <img src={psLogo} alt="" aria-hidden="true" className="h-7 w-auto object-contain" />
          <div className="flex flex-col leading-tight">
            <Helmet>
              <title>PSflix Admin</title>
            </Helmet>
            <span className="font-bold text-xl tracking-[0.05em] text-[#e2e2e2]">PsFlix</span>
            <span className="text-label-caps font-label-caps text-primary">Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {email && <span className="text-on-surface-variant text-body-md truncate">{email}</span>}
          <button
            type="button"
            onClick={onSignOut}
            className={cn(
              'btn-ghost rounded-lg px-3 py-2 text-on-surface text-body-md',
              'flex items-center gap-2',
            )}
          >
            <span className="material-symbols-outlined text-on-surface-variant">logout</span>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
