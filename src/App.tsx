import { Routes, Route } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/layout/Header';
import BrowseView from '@/routes/BrowseView';
import DetailsView from '@/routes/DetailsView';
import ConsoleView from '@/routes/ConsoleView';
import NotFoundView from '@/routes/NotFoundView';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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
        <Routes>
          <Route path="/" element={<BrowseView />} />
          <Route path="/game/:firstDiscSerial" element={<DetailsView />} />
          <Route path="/play/:firstDiscSerial" element={<ConsoleView />} />
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </ErrorBoundary>
    </>
  );
}
