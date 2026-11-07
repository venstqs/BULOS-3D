import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Embed from './Embed.jsx';
import { HOSTED } from './api';

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

// On the public site a phone gets the phone app instead of this computer layout (add ?desktop to stay)
const phone = /Android.+Mobile|iPhone|iPod/.test(navigator.userAgent) || (window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 600);
if (HOSTED && !embed && window.top === window && phone && !params.has('desktop')) {
  window.location.replace('/app/');
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary label="Bulos 3D">
        {embed ? <Embed mode={embed} params={params} /> : <App />}
      </ErrorBoundary>
    </StrictMode>,
  );
}
