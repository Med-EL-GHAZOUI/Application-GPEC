import { defineConfig } from 'vitest/config';

/**
 * Coverage of the whole suite: unit tests and e2e tests together, since most
 * services are exercised through the API. Needs PostgreSQL (npm run db:up).
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    root: './',
    include: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    // One shared database: files run one after the other (see vitest.config.e2e.ts).
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text-summary', 'text', 'html'],
      include: ['src/**/*.ts'],
      // Regression gate: measured at 100% / 93% when set, with a small margin.
      thresholds: { statements: 98, lines: 98, functions: 98, branches: 90 },
      exclude: [
        'src/**/*.spec.ts',
        // Declarative classes: decorators and metadata, no logic of their own.
        'src/**/dto/**',
        'src/**/entities/**',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/database/migrations/**',
        'src/database/seeds/**',
        'src/database/data-source.ts',
      ],
    },
  },
});
