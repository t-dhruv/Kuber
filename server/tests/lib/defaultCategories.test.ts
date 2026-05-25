import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS, seedDefaultCategories } from '../../src/lib/default-categories';

describe('default category buckets', () => {
  it('assigns every default category to a reporting bucket', () => {
    const unassigned = DEFAULT_CATEGORY_GROUPS.flatMap((group) =>
      group.categories
        .filter((category) => category.bucketType === 'uncategorized')
        .map((category) => `${group.name}/${category.name}`)
    );

    expect(unassigned).toEqual([]);
  });

  it('persists the declared bucket type when seeding defaults', async () => {
    const createGroup = vi.fn().mockResolvedValue({ id: 'group-1' });
    const createCategory = vi.fn().mockResolvedValue({ id: 'category-1' });

    await seedDefaultCategories(
      {
        categoryGroup: { create: createGroup },
        category: { create: createCategory },
      },
      'household-1',
    );

    expect(createCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Salary & Wages',
          bucketType: 'needs',
        }),
      }),
    );
  });
});
