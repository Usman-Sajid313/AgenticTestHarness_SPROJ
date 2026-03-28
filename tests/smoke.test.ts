import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs in CI', () => {
    expect(true).toBe(true);
  });
});
