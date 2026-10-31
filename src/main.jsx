import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Embed from './Embed.jsx';

// After a rebuild, an open tab may ask for a code file that no longer exists.
// Reload once to pick up the new build instead of showing a broken page.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (sessionStorage.getItem('bulos-reloaded') !== '1') {
    sessionStorage.setItem('bulos-reloaded', '1');
    window.location.reload();
  }
});
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('bulos-reloaded'), 10000));

const params = new URLSearchParams(window.location.search);
const embed = params.get('embed');                     // 'map' | 'site' (mobile app WebView)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary label="Bulos 3D">
      {embed ? <Embed mode={embed} params={params} /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
