import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serwer API (Express + Socket.io) działa na porcie 4001.
// Wszystkie wywołania /api i /socket.io są proxy'owane — frontend nigdy
// nie woła localhost bezpośrednio (działa też w podglądzie na żywo).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        ws: true
      }
    }
  },
  preview: {
    host: true,
    port: 4173
  }
});
