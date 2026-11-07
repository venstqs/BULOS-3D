import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  // Listen on IPv4 explicitly: on Windows 'localhost' can bind IPv6-only, and then
  // http://127.0.0.1:5173 is refused while http://localhost:5173 only works in some browsers.
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 5173 },
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: { input: { main: 'index.html', landing: 'landing.html' } },
  },
});
