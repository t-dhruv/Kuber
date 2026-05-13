import { prisma } from './prisma';
import { logger } from './logger.js';
import { decrypt } from './encryption.js';

const jobLog = logger.child({ module: 'jobs' });

// Static fallback mappings (from seed data)
const BUCKET_DEFAULTS: Record<string, 'needs' | 'wants' | 'savings'> = {
  // Needs
  'Rent & Mortgage': 'needs', 'Home Maintenance': 'needs', 'Electricity / Hydro': 'needs',
  'Water & Sewage': 'needs', 'Heating & Gas': 'needs', 'Internet': 'needs', 'Phone Plan': 'needs',
  'Home Insurance': 'needs', 'Groceries': 'needs', 'Fuel & Gas': 'needs', 'Public Transit': 'needs',
  'Auto Insurance': 'needs', 'Car Maintenance & Repairs': 'needs', 'Registration & Licensing': 'needs',
  'Property Taxes': 'needs', 'Childcare/Daycare': 'needs', 'School Fees/Supplies': 'needs',
  'Toiletries': 'needs', 'Pet Food': 'needs', 'Vet & Pet Meds': 'needs',
  'Life Insurance': 'needs', 'Disability Insurance': 'needs', 'Dental & Vision': 'needs',
  'Prescriptions': 'needs', 'Bank Fees & Interest': 'needs', 'Loan/Debt Repayment': 'needs',
  'Minimum Debt Payments': 'needs',
  // Wants
  'Restaurants': 'wants', 'Coffee Shops': 'wants', 'Takeout & Delivery': 'wants',
  'Alcohol & Bars': 'wants', 'Rideshare': 'wants', 'Parking & Tolls': 'wants',
  'Gym & Fitness': 'wants', 'Hair & Beauty': 'wants', 'Toys & Activities': 'wants',
  'Pet Grooming': 'wants', 'Clothing & Apparel': 'wants', 'Electronics & Gadgets': 'wants',
  'Online Shopping': 'wants', 'Home & Garden': 'wants', 'Subscriptions': 'wants',
  'Movies & Streaming': 'wants', 'Music': 'wants', 'Games': 'wants',
  'Events & Concerts': 'wants', 'Sports': 'wants', 'Gambling & Lottery': 'wants',
  'Flights': 'wants', 'Hotels & Lodging': 'wants', 'Vacation Activities': 'wants',
  'Travel Insurance': 'wants', 'Professional Development': 'wants', 'Gifts': 'wants',
  'Dining Out': 'wants', 'Personal Care': 'wants', 'Entertainment': 'wants', 'Shopping': 'wants',
  'Travel': 'wants',
  // Savings
  'Emergency Fund': 'savings', 'Savings Account': 'savings', 'TFSA Contribution': 'savings',
  'Investment Purchase': 'savings', 'Retirement': 'savings', 'Savings': 'savings',
  'Investments': 'savings', 'Debt Repayment': 'savings',
};

type BucketType = 'needs' | 'wants' | 'savings';

// AI provider SDKs (dynamically imported to avoid errors if not installed)
async function getAiMapping(householdId: string, categoryNames: string[]): Promise<Record<string, BucketType> | null> {
  try {
    // Check if AI is configured for this household
    const aiConfig = await prisma.aiConfig.findUnique({ where: { householdId } });
    if (!aiConfig || aiConfig.provider === 'none') {
      jobLog.debug({ householdId }, 'AI not configured for household');
      return null;
    }

    // Decrypt API key
    let apiKey: string;
    try {
      apiKey = decrypt(aiConfig.encryptedApiKey);
    } catch (err) {
      jobLog.error({ err, householdId }, 'Failed to decrypt AI API key');
      return null;
    }

    // Build prompt
    const prompt = `Classify each category into exactly one bucket type: "needs", "wants", or "savings".
- Needs: Essential expenses for basic living (rent, groceries, utilities, insurance, healthcare)
- Wants: Discretionary non-essential spending (dining, entertainment, hobbies, travel)
- Savings: Money set aside for future (emergency fund, investments, retirement)

Return ONLY a valid JSON object with category names as keys and bucket types as values. No extra text.
Categories: ${JSON.stringify(categoryNames)}`;

    // Call AI provider
    let responseText = '';
    switch (aiConfig.provider) {
      case 'anthropic': {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey });
        const msg = await client.messages.create({
          model: aiConfig.model || 'claude-3-haiku-20240307',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
          ...(aiConfig.baseUrl ? { baseURL: aiConfig.baseUrl } : {}),
        });
        responseText = msg.content[0].type === 'text' ? msg.content[0].text : '';
        break;
      }
      case 'openai': {
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({
          apiKey,
          baseURL: aiConfig.baseUrl || undefined,
        });
        const completion = await client.chat.completions.create({
          model: aiConfig.model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        });
        responseText = completion.choices[0]?.message?.content || '';
        break;
      }
      case 'gemini': {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: aiConfig.model || 'gemini-pro' });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        break;
      }
      default:
        jobLog.warn({ provider: aiConfig.provider }, 'Unsupported AI provider');
        return null;
    }

    // Parse and validate response
    const parsed = JSON.parse(responseText);
    const mappings: Record<string, BucketType> = {};
    const validBuckets = new Set<BucketType>(['needs', 'wants', 'savings']);

    for (const name of categoryNames) {
      const bucket = parsed[name];
      if (bucket && validBuckets.has(bucket)) {
        mappings[name] = bucket;
      }
    }

    jobLog.info({ householdId, mappedCount: Object.keys(mappings).length }, 'AI mapping successful');
    return mappings;

  } catch (err) {
    jobLog.error({ err, householdId }, 'AI mapping failed');
    return null;
  }
}

export async function runCategoryBucketJob(): Promise<{ updated: number; skipped: number }> {
  // Fetch all uncategorized categories grouped by household
  const categories = await prisma.category.findMany({
    where: { bucketType: 'uncategorized' },
    select: { id: true, name: true, householdId: true },
  });

  if (categories.length === 0) {
    jobLog.info('No uncategorized categories found');
    return { updated: 0, skipped: 0 };
  }

  // Group by household
  const householdGroups = new Map<string, typeof categories>();
  for (const cat of categories) {
    const group = householdGroups.get(cat.householdId) || [];
    group.push(cat);
    householdGroups.set(cat.householdId, group);
  }

  let totalUpdated = 0;
  let totalSkipped = 0;

  // Process each household
  for (const [householdId, cats] of householdGroups) {
    const categoryNames = cats.map(c => c.name);
    const aiMappings = await getAiMapping(householdId, categoryNames);

    // Process each category
    const updates = cats.map(async (cat) => {
      // Try AI first, then static fallback
       const bucketType: BucketType | undefined =
        (aiMappings && aiMappings[cat.name]) ||
        BUCKET_DEFAULTS[cat.name];

      if (bucketType) {
        await prisma.category.update({
          where: { id: cat.id },
          data: { bucketType },
        });
        totalUpdated++;
        jobLog.info({
          categoryId: cat.id,
          name: cat.name,
          bucketType,
          source: (aiMappings && aiMappings[cat.name]) ? 'ai' : 'static'
        }, 'Category bucket assigned');
      } else {
        totalSkipped++;
        jobLog.info({ categoryId: cat.id, name: cat.name }, 'No bucket type found');
      }
    });

    await Promise.all(updates);
  }

  jobLog.info({ total: categories.length, updated: totalUpdated, skipped: totalSkipped }, 'Category bucket job complete');
  return { updated: totalUpdated, skipped: totalSkipped };
}
