import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Node by default. The vast majority of this suite is pure logic and runs
    // markedly faster without a DOM, and several shading tests are heavy enough
    // that a global jsdom would cost real time. Component tests opt IN per file
    // with a `// @vitest-environment jsdom` docblock on line 1.
    environment: 'node',
  },
  // React 19's automatic JSX runtime. Without this, esbuild emits classic
  // `React.createElement` calls into test files that never import React, and
  // every component test dies with "React is not defined".
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
