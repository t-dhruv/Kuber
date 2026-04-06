import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': '/src' } },
  server: {
    port: 9001,
    proxy: {
      '/api': {
        target: 'http://localhost:9002',
        changeOrigin: true,
        // Required for SSE streaming — prevents Vite's proxy from buffering the response
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Pass through SSE responses without buffering
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
            }
          });
        },
      },
    }
  }
});
