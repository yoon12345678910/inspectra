import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@inspectra/agent-main': path.resolve(__dirname, 'packages/agent-main/src/index.ts'),
      '@inspectra/eruda-runtime': path.resolve(
        __dirname,
        'packages/eruda-runtime/src/index.ts'
      ),
      '@inspectra/eruda-plugin-webrtc': path.resolve(
        __dirname,
        'packages/eruda-plugin-webrtc/src/index.ts'
      )
    }
  }
});
