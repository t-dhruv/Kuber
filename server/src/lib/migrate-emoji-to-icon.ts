/**
 * Migration: Map existing category emojis to Lucide icon IDs
 * 
 * Run: node dist/lib/migrate-emoji-to-icon.js
 * (After building with tsc)
 */

const { prisma } = require('../lib/prisma.js');

const EMOJI_TO_ICON: Record<string, string> = {
  '🍔': 'utensils', '🍕': 'utensils', '🥗': 'utensils',
  '☕': 'coffee', '🍺': 'beer', '🍷': 'beer', '🍽️': 'utensils',
  '🛒': 'shopping-cart', '🛍️': 'shopping-cart',
  '🏠': 'home', '🏡': 'home', '🏢': 'briefcase', '🏦': 'credit-card',
  '🚗': 'car', '🚕': 'car', '🚙': 'car', '🚌': 'car',
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
  
  const categories = await prisma.category.findMany({
    where: { emoji: { not: null } },
    select: { id: true, name: true, emoji: true },
  });
  
  console.log(`📊 Found ${categories.length} categories with emojis`);
  
  let migrated = 0;
  
  for (const cat of categories) {
    if (!cat.emoji) continue;
    
    const firstEmoji = cat.emoji[0];
    const iconId = EMOJI_TO_ICON[firstEmoji];
    
    if (iconId) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { icon: iconId },
      });
      migrated++;
    }
  }
  
  console.log(`✨ Migration complete: ${migrated} migrated`);
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