import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { onQueryError } from './lib/pb-query';
import { Toast } from './components/Toast';
import './features/auth/store';
import './styles/index.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: onQueryError,
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
          <Toast />
        </HashRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
);
