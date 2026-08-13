import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClientProvider } from '@tanstack/react-query';
import { AdminApp } from './AdminApp';
import { adminQueryClient } from './lib/queryClient';
import './features/auth/store';
import '@/styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={adminQueryClient}>
        <HashRouter>
          <AdminApp />
        </HashRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
);
