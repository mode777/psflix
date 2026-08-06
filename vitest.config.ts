import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/features/**', 'src/components/**'],
      exclude: ['src/test/**', 'src/types/pocketbase.ts', 'src/**/*.test.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'emulator-core': path.resolve(__dirname, './src/vendor/psxanywhere/emulator/index.ts'),
      'emulator-client': path.resolve(__dirname, './src/vendor/psxanywhere/client/index.ts'),
      repository: path.resolve(__dirname, './src/vendor/psxanywhere/repository/index.ts'),
      mcrreader: path.resolve(__dirname, './src/vendor/mcrreader/index.ts'),
    },
  },
});
