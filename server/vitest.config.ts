import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The database-backed suite runs under vitest.db.config.ts against a real
    // Postgres. It must not load the global Prisma mock this config installs.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/db/**'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: [
        'src/lib/amortization.ts',
        'src/lib/amountParser.ts',
        'src/lib/cronRegistry.ts',
        'src/lib/csvColumnDetector.ts',
        'src/lib/csvExport.ts',
        'src/lib/encryption.ts',
        'src/lib/imapConfig.ts',
        'src/lib/importDedup.ts',
        'src/lib/logoFetchJob.ts',
        'src/lib/metrics.ts',
        'src/lib/reportCashFlow.ts',
        'src/lib/reportDiagnostics.ts',
        'src/lib/reportInvestments.ts',
        'src/lib/reportOverview.ts',
        'src/lib/reportRules.ts',
        'src/lib/ruleExecutionJob.ts',
        'src/lib/softDeleteWhere.ts',
        'src/lib/token.ts',
        'src/lib/transactionLinks.ts',
        'src/lib/wealthAnalysis.ts',
        'src/lib/reporting/classification.ts',
        'src/lib/reporting/overview.ts',
        'src/lib/reporting/periods.ts',
        'src/lib/reporting/rollups.ts',
        'src/lib/reporting/snapshots.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
