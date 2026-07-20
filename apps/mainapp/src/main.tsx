import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles/tailwind.css';
import App from './App';
import { initSentry, Sentry } from './lib/sentry';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);

function ErrorFallback() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-2 bg-white text-center">
      <p className="text-sm font-medium text-slate-900">Something went wrong.</p>
      <p className="text-sm text-slate-500">Try reloading the page — this has been reported.</p>
    </div>
  );
}

root.render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
