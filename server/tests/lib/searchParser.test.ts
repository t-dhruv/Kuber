import { describe, expect, it } from 'vitest';
import { parseSearchQuery, buildSearchWhere } from '../../src/lib/searchParser';

describe('parseSearchQuery', () => {
  it('parses free text as text node', () => {
    const nodes = parseSearchQuery('coffee');
    expect(nodes).toEqual([{ type: 'text', value: 'coffee' }]);
  });

  it('parses field:value node', () => {
    const nodes = parseSearchQuery('category:food');
    expect(nodes).toEqual([{ type: 'field', key: 'category', op: '=', value: 'food' }]);
  });

  it('parses amount with > operator', () => {
    expect(parseSearchQuery('amount:>100')).toEqual([{ type: 'field', key: 'amount', op: '>', value: '100' }]);
  });

  it('parses amount with <= operator', () => {
    expect(parseSearchQuery('amount:<=50')).toEqual([{ type: 'field', key: 'amount', op: '<=', value: '50' }]);
  });

  it('parses quoted value', () => {
    const nodes = parseSearchQuery('category:"food & drink"');
    expect(nodes).toEqual([{ type: 'field', key: 'category', op: '=', value: 'food & drink' }]);
  });

  it('parses multiple tokens', () => {
    const nodes = parseSearchQuery('coffee amount:>10 category:dining');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ type: 'text', value: 'coffee' });
    expect(nodes[1]).toEqual({ type: 'field', key: 'amount', op: '>', value: '10' });
    expect(nodes[2]).toEqual({ type: 'field', key: 'category', op: '=', value: 'dining' });
  });
});

describe('buildSearchWhere', () => {
  it('builds OR search for free text', () => {
    const where = buildSearchWhere('coffee');
    expect(where).toMatchObject({
      AND: [{ OR: expect.arrayContaining([{ description: { contains: 'coffee', mode: 'insensitive' } }]) }],
    });
  });

  it('builds amount gt filter', () => {
    const where = buildSearchWhere('amount:>100');
    expect(where).toMatchObject({ AND: [{ amountDecimal: { gt: 100 } }] });
  });

  it('builds category filter', () => {
    const where = buildSearchWhere('category:food');
    expect(where).toMatchObject({
      AND: [{ category: { name: { contains: 'food', mode: 'insensitive' } } }],
    });
  });

  it('returns empty AND for unknown field', () => {
    const where = buildSearchWhere('unknown:value');
    expect(where).toMatchObject({ AND: [{}] });
  });

  it('builds has:no_category filter', () => {
    const where = buildSearchWhere('has:no_category');
    expect(where).toMatchObject({ AND: [{ categoryId: null }] });
  });
});

