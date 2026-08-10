import { createHashRouter } from 'react-router-dom';
import App from './App';
import BrowseView from '@/routes/BrowseView';
import DetailsView from '@/routes/DetailsView';
import ConsoleView from '@/routes/ConsoleView';
import NotFoundView from '@/routes/NotFoundView';

/**
 * Data router (hash-based). `createHashRouter` is used instead of the classic
 * `<HashRouter>` component because data-router hooks like `useBlocker` (used by
 * ConsoleView's save-on-navigate) require a data router. Hash routing is
 * preserved so every route resolves to `index.html` without server-side
 * rewrites — PocketBase's static handler does not do SPA fallback.
 */
export const router = createHashRouter([
  {
    element: <App />,
    children: [
      { path: '/', element: <BrowseView /> },
      { path: '/game/:firstDiscSerial', element: <DetailsView /> },
      { path: '/play/:firstDiscSerial', element: <ConsoleView /> },
      { path: '*', element: <NotFoundView /> },
    ],
  },
]);
