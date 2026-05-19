import { describe, expect, it } from 'vitest';
import { getCategoryPillStyle } from '../src/lib/displayStyles';

describe('getCategoryPillStyle', () => {
  it('uses a valid themed background when no category color is provided', () => {
    expect(getCategoryPillStyle()).toEqual({
      color: 'var(--color-accent)',
      backgroundColor: 'var(--color-accent-light)',
    });
  });

  it('keeps hex category colors with a light alpha background', () => {
    expect(getCategoryPillStyle('#1971c2')).toEqual({
      color: '#1971c2',
      backgroundColor: '#1971c218',
    });
  });
});
