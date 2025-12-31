import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0', // Listen on all network interfaces
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // Proxy API requests to the backend
        changeOrigin: true,
      },
    },
  },
});