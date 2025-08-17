import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

const el = document.getElementById('root');
if (!el) {
  const fallback = document.createElement('div');
  fallback.style.cssText = 'padding:16px;background:#fee;color:#900;font-family:system-ui';
  fallback.textContent = 'Mount failed: #root not found in index.html';
  document.body.prepend(fallback);
} else {
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
