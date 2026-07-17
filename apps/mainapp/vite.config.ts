import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const DEV_PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';

export default defineConfig({
  plugins: [react()],
  // Vite's built-in asset-type list doesn't include PDFs — without this, importing a .pdf file
  // gets processed as a JS module instead of resolving to a static asset URL.
  assetsInclude: ['**/*.pdf'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: HOST,
    port: DEV_PORT,
    strictPort: true,
    cors: true,
    proxy: {
      '/api': {
        target: process.env.API_GATEWAY_URL || 'http://127.0.0.1:8081',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
