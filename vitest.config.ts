import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@inspectra/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@inspectra/bridge': path.resolve(__dirname, 'packages/bridge/src/index.ts'),
      '@inspectra/agent-main': path.resolve(__dirname, 'packages/agent-main/src/index.ts'),
      '@inspectra/ui-overlay': path.resolve(__dirname, 'packages/ui-overlay/src/index.tsx'),
      '@inspectra/adapter-chromium': path.resolve(__dirname, 'packages/adapter-chromium/src/index.ts')
    }
  }
});

