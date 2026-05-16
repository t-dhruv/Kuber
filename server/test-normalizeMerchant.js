import { normalizeMerchant } from './src/lib/autoCategorize.js';

const testCases = [
  'AMAZON.CA* B70MA7890',
  'AMAZON.CA* BY0TE4C51',
  '*#@!',
  '***',
  '   ',
  'Simple Store Name',
  'STORE#12345',
  '',
  'A', // single char
];

console.log('Testing normalizeMerchant edge cases:');
for (const input of testCases) {
  const result = normalizeMerchant(input);
  console.log(`  "${input}" → "${result}" (empty: ${result === ''})`);
}
