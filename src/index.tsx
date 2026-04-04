import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';

import { AuthProvider } from './contexts/AuthContext';
import { BibleProvider } from './contexts/BibleContext';
import { AudioProvider } from './contexts/AudioContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ToastProvider } from './contexts/ToastContext';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30,     // 30 min — conteúdo bíblico não muda
      gcTime: 1000 * 60 * 60,         // 1h em memória
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <BibleProvider>
          <LanguageProvider>
            <ToastProvider>
              <AudioProvider>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              </AudioProvider>
            </ToastProvider>
          </LanguageProvider>
        </BibleProvider>
      </AuthProvider>
    </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
