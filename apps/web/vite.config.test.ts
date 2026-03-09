import { describe, expect, it } from 'vitest';
import { resolveRepoRef } from './vite.config';

describe('resolveRepoRef', () => {
  it('defaults to main when no override is provided', () => {
    expect(resolveRepoRef()).toBe('main');
    expect(resolveRepoRef('')).toBe('main');
    expect(resolveRepoRef('   ')).toBe('main');
  });

  it('uses the explicit SPECHUB_REF override when provided', () => {
    expect(resolveRepoRef('release')).toBe('release');
  });
});
