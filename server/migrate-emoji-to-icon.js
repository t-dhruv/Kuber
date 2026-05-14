/**
 * Migration: Map existing category emojis to Lucide icon IDs
 * Simple SQL-based - no Prisma needed
 *
 * Run: node migrate-emoji-to-icon.js
 */

/* eslint-disable no-undef, @typescript-eslint/no-require-imports */

const { PrismaClient } = require('@prisma/client');

const EMOJI_TO_ICON = {
  '🍔': 'utensils', '🍕': 'utensils', '🥗': 'utensils',
  '☕': 'coffee', '🍺': 'beer', '🍷': 'beer', '🍽️': 'utensils',
  '🛒': 'shopping-cart', '🛍️': 'shopping-cart',
  '🏠': 'home', '🏡': 'home', '🏢': 'briefcase', '🏦': 'credit-card',
  '🚗': 'car', '🚕': 'car', '🚙': 'car', '🚆': 'car',
  '✈️': 'plane', '🛫': 'plane', '🛩️': 'plane', '⛽': 'car',
  '🅿️': 'car', '🅱️': 'heart', '❤️': 'heart',
  '💊': 'stethoscope', '💉': 'stethoscope', '🏥': 'stethoscope',
  '💰': 'piggy-bank', '💵': 'dollar-sign', '💸': 'dollar-sign',
  '💳': 'credit-card',
  '🎬': 'film', '🎥': 'film', '🎮': 'gamepad2', '🎲': 'gamepad2',
  '🎧': 'music', '🎵': 'music', '🎶': 'music',
  '📱': 'smartphone', '💻': 'laptop', '⌨️': 'laptop', '🖥️': 'laptop',
  '📡': 'wifi', '📶': 'wifi', '📞': 'phone', '📟': 'phone',
  '📚': 'book-open', '📖': 'book-open',
  '🎓': 'graduation-cap', '🏫': 'graduation-cap',
  '🏋️': 'dumbbell', '🏊': 'dumbbell', '⚽': 'dumbbell',
  '🎁': 'gift', '🎀': 'gift', '🎂': 'gift',
  '💼': 'briefcase', '📁': 'briefcase', '📂': 'briefcase',
  '🎫': 'tag', '🏷️': 'tag',
  '🧴': 'sparkles', '💄': 'sparkles', '💅': 'sparkles',
  '🛀': 'sparkles', '🚿': 'sparkles', '🛁': 'sparkles',
  '🎉': 'star', '🎊': 'star', '🎈': 'star',
  '⭐': 'star', '✨': 'star',
  '⚡': 'zap', '💡': 'zap', '🔋': 'zap',
  '💧': 'zap', '🔥': 'zap',
  '💹': 'trending-up', '📈': 'trending-up',
  '📦': 'shopping-cart',
  '✅': 'check',
};

async function migrate() {
  console.log('🔄 Starting emoji → icon migration...');
  const prisma = new PrismaClient();
  
  try {
    // Get categories with emojis that haven't been migrated yet
    const categories = await prisma.$queryRaw`
      SELECT id, name, emoji FROM categories WHERE emoji IS NOT NULL AND icon IS NULL
    `;
    
    console.log(`📊 Found ${categories.length} categories to migrate`);
    
    let migrated = 0;
    for (const cat of categories) {
      const firstEmoji = cat.emoji?.[0] || '';
      const iconId = EMOJI_TO_ICON[firstEmoji];
      
      if (iconId) {
        await prisma.$executeRaw`
          UPDATE categories SET icon = ${iconId} WHERE id = ${cat.id}
        `;
        migrated++;
        console.log(`  ✅ ${cat.name}: ${firstEmoji} → ${iconId}`);
      }
    }
    
    console.log(`✨ Migration complete: ${migrated} migrated`);
  } finally {
    await prisma.$disconnect();
  }
}

migrate()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });

/* eslint-enable no-undef, @typescript-eslint/no-require-imports */