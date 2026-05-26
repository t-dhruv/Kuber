import { vi } from 'vitest';

const mockPrismaClient = {
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  $transaction: vi.fn((fn) => fn()),
  account: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() },
  accountType: { findMany: vi.fn() },
  category: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  household: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  user: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  transaction: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() },
  transactionJournal: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  transactionJournalMeta: { create: vi.fn(), findMany: vi.fn() },
  transactionEntry: { updateMany: vi.fn() },
  journalTag: { upsert: vi.fn(), deleteMany: vi.fn() },
  duplicateDismissal: { findMany: vi.fn(), createMany: vi.fn(), upsert: vi.fn() },
  ruleExecutionLog: { create: vi.fn() },
  transactionSplit: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() },
  transactionLink: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  recurringTransaction: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  rule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  budget: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() },
  bill: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  schedule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  netWorthSnapshot: { findMany: vi.fn(), upsert: vi.fn() },
  asset: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  liability: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  investment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  investmentPrice: { findMany: vi.fn(), createMany: vi.fn() },
  priceCache: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  goal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  notification: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  pushSubscription: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  accountBalanceSnapshot: { upsert: vi.fn() },
  reportingSnapshot: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  reportingRollup: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  settings: { findFirst: vi.fn(), upsert: vi.fn() },
  checkpoint: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  auditLog: { findMany: vi.fn(), create: vi.fn() },
  apiToken: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  objectGroup: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  attachment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  importJob: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  importDedup: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  webhookEndpoint: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  webhookDelivery: { findMany: vi.fn(), create: vi.fn() },
  wealthSnapshot: { findMany: vi.fn() },
  report: { findMany: vi.fn(), create: vi.fn() },
  refreshToken: { create: vi.fn(), deleteMany: vi.fn() },
  securityToken: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
};

export const prismaMock = mockPrismaClient;

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => mockPrismaClient),
  Prisma: {
    Decimal: class Decimal {
      private readonly num: number;
      constructor(value: string | number) {
        this.num = typeof value === 'string' ? parseFloat(value) : value;
      }
      toDecimalPlaces(_p: number): Decimal {
        return new Decimal(this.num);
      }
      valueOf(): number {
        return this.num;
      }
      toNumber(): number {
        return this.num;
      }
    },
  },
}));

vi.mock('./lib/prisma', () => ({
  prisma: mockPrismaClient,
}));
