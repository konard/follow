#!/usr/bin/env node

/**
 * Test script to verify admin skip message detection
 * This tests the regex pattern that detects "ещё НЕ прошло 5 чужих ссылок" messages
 */

// Test messages
const testMessages = [
  {
    text: '⚠ Константин Дьяченко, ещё НЕ прошло 5 чужих ссылок. Дождитесь.',
    shouldMatch: true,
    description: 'Exact message from issue'
  },
  {
    text: '[TG подписки](https://vk.com/club223453532)\n⚠ [Константин Дьяченко](https://vk.com/konard), ещё НЕ прошло 5 чужих ссылок. Дождитесь.',
    shouldMatch: true,
    description: 'Message with links and formatting'
  },
  {
    text: 'ещё не прошло 5 чужих ссылок',
    shouldMatch: true,
    description: 'Lowercase variation'
  },
  {
    text: 'ЕЩЁ НЕ ПРОШЛО 5 ЧУЖИХ ССЫЛОК',
    shouldMatch: true,
    description: 'Uppercase variation'
  },
  {
    text: 'Ваша ссылка удалена',
    shouldMatch: false,
    description: 'Generic deletion message'
  },
  {
    text: 'Спам запрещен',
    shouldMatch: false,
    description: 'Different admin message'
  },
  {
    text: '',
    shouldMatch: false,
    description: 'Empty message'
  },
  {
    text: null,
    shouldMatch: false,
    description: 'Null message'
  }
];

// The pattern from the implementation
const skipPattern = /ещё\s+НЕ\s+прошло\s+5\s+чужих\s+ссылок/i;

console.log('🧪 Testing Admin Skip Message Detection\n');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

for (const test of testMessages) {
  const matches = !!(test.text && skipPattern.test(test.text));
  const result = matches === test.shouldMatch ? '✅ PASS' : '❌ FAIL';

  if (matches === test.shouldMatch) {
    passed++;
  } else {
    failed++;
  }

  console.log(`\n${result}: ${test.description}`);
  console.log(`  Text: ${test.text === null ? 'null' : test.text === '' ? '(empty string)' : `"${test.text}"`}`);
  console.log(`  Expected: ${test.shouldMatch ? 'MATCH' : 'NO MATCH'}`);
  console.log(`  Got: ${matches ? 'MATCH' : 'NO MATCH'}`);
}

console.log('\n' + '='.repeat(60));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
