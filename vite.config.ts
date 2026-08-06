import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'emulator-core': path.resolve(__dirname, './src/vendor/psxanywhere/emulator/index.ts'),
      'emulator-client': path.resolve(__dirname, './src/vendor/psxanywhere/client/index.ts'),
      repository: path.resolve(__dirname, './src/vendor/psxanywhere/repository/index.ts'),
      mcrreader: path.resolve(__dirname, './src/vendor/mcrreader/index.ts'),
    },
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          pocketbase: ['pocketbase'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
