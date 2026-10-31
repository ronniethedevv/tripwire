import { describe, expect, it } from 'vitest';

// Phase 0 smoke test: proves the TypeScript + vitest toolchain runs green in CI.
// Real tests (state machine, conditions, fire-once) arrive with feature code.
describe('scaffold', () => {
  it('runs the test toolchain', () => {
    expect(1 + 1).toBe(2);
  });
});
