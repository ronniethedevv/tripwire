import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Fail CI if a run matches no tests, rather than passing silently.
    passWithNoTests: false,
  },
});
