import { prisma } from '../lib/prisma';
import { backfillLegacyTransactionJournals } from '../lib/transactionJournalService';

const DEFAULT_LIMIT = 500;

function parseArgs() {
  const args = new Map<string, string>();

  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key && value !== undefined) {
      args.set(key, value);
    }
  }

  const rawLimit = Number(args.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT;

  return {
    householdId: args.get('householdId'),
    limit,
  };
}

async function main() {
  const { householdId, limit } = parseArgs();
  const result = await backfillLegacyTransactionJournals({ householdId, limit });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error('Transaction journal backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
