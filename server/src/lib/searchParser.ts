import type { Prisma } from '@prisma/client';

type FieldNode = { type: 'field'; key: string; op: string; value: string };
type TextNode  = { type: 'text'; value: string };
export type SearchNode = FieldNode | TextNode;

export function parseSearchQuery(query: string): SearchNode[] {
  const nodes: SearchNode[] = [];
  const TOKEN = /(\w+):(>=?|<=?|<>)?(?:"([^"]+)"|(\S+))|"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;

  while ((m = TOKEN.exec(query)) !== null) {
    if (m[1] !== undefined) {
      const key   = m[1];
      const rawOp = m[2] ?? '=';
      const op    = rawOp === '' ? '=' : rawOp;
      const value = m[3] ?? m[4] ?? '';
      nodes.push({ type: 'field', key, op, value });
    } else {
      const value = m[5] ?? m[6] ?? '';
      if (value) nodes.push({ type: 'text', value });
    }
  }
  return nodes;
}

type TxWhere = Prisma.TransactionJournalWhereInput;

const OP_TO_PRISMA: Record<string, string> = {
  '>':  'gt',
  '>=': 'gte',
  '<':  'lt',
  '<=': 'lte',
  '=':  'equals',
};

function resolveDateKeyword(value: string): TxWhere {
  const now = new Date();
  if (value === 'today') {
    return { date: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } };
  }
  if (value === 'this-month') {
    return { date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
  }
  if (value === 'last-month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 1);
    return { date: { gte: start, lt: end } };
  }
  if (value === 'this-year') {
    return { date: { gte: new Date(now.getFullYear(), 0, 1) } };
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? {} : { date: { gte: d } };
}

const FIELD_BUILDERS: Record<string, (value: string, op: string) => TxWhere> = {
  amount: (v, op) => {
    const num      = parseFloat(v);
    const prismaOp = OP_TO_PRISMA[op] ?? 'equals';
    return { amountDecimal: { [prismaOp]: num } as Prisma.DecimalFilter<'TransactionJournal'> };
  },
  category:    (v) => ({ category: { name: { contains: v, mode: 'insensitive' } } }),
  account:     (v) => ({ entries: { some: { account: { name: { contains: v, mode: 'insensitive' } } } } }),
  tag:         (v) => ({ tags: { some: { tag: { name: { contains: v, mode: 'insensitive' } } } } }),
  date:        (v) => resolveDateKeyword(v),
  date_before: (v) => ({ date: { lt: new Date(v) } }),
  date_after:  (v) => ({ date: { gt: new Date(v) } }),
  notes:       (v) => ({ notes: { contains: v, mode: 'insensitive' } }),
  merchant:    (v) => ({ merchant: { displayName: { contains: v, mode: 'insensitive' } } }),
  has: (v) => {
    if (v === 'no_category') return { categoryId: null };
    if (v === 'attachment')  return { attachments: { some: {} } };
    if (v === 'notes')       return { notes: { not: null } };
    return {};
  },
};

export function buildSearchWhere(query: string): TxWhere {
  const nodes   = parseSearchQuery(query);
  const clauses = nodes.map((node): TxWhere => {
    if (node.type === 'field') {
      const builder = FIELD_BUILDERS[node.key];
      return builder ? builder(node.value, node.op) : {};
    }
    return {
      OR: [
        { description: { contains: node.value, mode: 'insensitive' } },
        { notes:       { contains: node.value, mode: 'insensitive' } },
        { merchant:    { displayName: { contains: node.value, mode: 'insensitive' } } },
      ],
    };
  });
  return { AND: clauses };
}
