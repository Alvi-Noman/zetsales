import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/tailwind.css';
import App from './App';
import { initSentry, Sentry } from './lib/sentry';

initSentry();

const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);

function ErrorFallback() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-2 bg-slate-950 text-center">
      <p className="text-sm font-medium text-white">Something went wrong.</p>
      <p className="text-sm text-slate-400">Try reloading the page — this has been reported.</p>
    </div>
  );
}

root.render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
