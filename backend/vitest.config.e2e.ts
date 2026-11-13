import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Every file runs against the same PostgreSQL database. The dashboard
    // measures company-wide figures, which another file creating data at the
    // same time would disturb: run the files one after the other.
    fileParallelism: false,
  },
});
