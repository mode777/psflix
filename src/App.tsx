import { Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/layout/Header';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * Always-mounted app chrome: the global `<title>` default, the persistent
 * Header, and the render-level ErrorBoundary. Lives on a pathless layout route
 * (see router.tsx) so it never unmounts on navigation between the child views —
 * the Header is global, not per-route (see AGENTS.md).
 */
export default function App() {
  return (
    <>
      <Helmet>
        <title>PSflix</title>
        <meta
          name="description"
          content="PSflix — a Netflix-style catalog of PlayStation 1 classics."
        />
        <meta name="theme-color" content="#121414" />
      </Helmet>
      <Header />
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </>
  );
}
