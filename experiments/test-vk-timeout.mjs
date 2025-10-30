#!/usr/bin/env node

/**
 * Experiment script to test VK API timeout and retry behavior
 *
 * This script tests:
 * 1. Different timeout configurations
 * 2. Retry mechanism with exponential backoff
 * 3. Error handling for timeout errors
 */

import { VKClient } from '../vk.lib.mjs';

async function testWithTimeout(timeoutMs, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${description}`);
  console.log(`Timeout: ${timeoutMs}ms`);
  console.log(`${'='.repeat(60)}`);

  try {
    const client = new VKClient({
      apiTimeout: timeoutMs,
      apiRetryLimit: 3
    });

    const startTime = Date.now();
    const conversations = await client.getConversations({
      count: 10,
      offset: 0,
      fields: 'photo_100,members_count'
    });

    const elapsed = Date.now() - startTime;
    console.log(`✅ Success! Fetched ${conversations.items.length} conversations`);
    console.log(`   Time elapsed: ${elapsed}ms`);

    return { success: true, elapsed, count: conversations.items.length };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(`❌ Failed: ${error.message}`);
    console.log(`   Error type: ${error.type || error.code || 'unknown'}`);
    console.log(`   Time elapsed: ${elapsed}ms`);

    return { success: false, elapsed, error: error.message };
  }
}

async function runExperiments() {
  console.log('🧪 VK API Timeout and Retry Experiment');
  console.log('=====================================\n');

  const tests = [
    { timeout: 5000, description: 'Very short timeout (5s) - likely to fail' },
    { timeout: 10000, description: 'Default vk-io timeout (10s) - may fail' },
    { timeout: 30000, description: 'Increased timeout (30s) - should succeed' },
    { timeout: 60000, description: 'Long timeout (60s) - very safe' }
  ];

  const results = [];

  for (const test of tests) {
    const result = await testWithTimeout(test.timeout, test.description);
    results.push({ ...test, ...result });

    // Wait a bit between tests to avoid rate limiting
    if (test !== tests[tests.length - 1]) {
      console.log('\n⏱️  Waiting 2s before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Print summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Summary');
  console.log(`${'='.repeat(60)}\n`);

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.timeout}ms timeout: ${result.success ? `${result.elapsed}ms` : result.error}`);
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`\n📈 Success rate: ${successCount}/${results.length}`);

  if (successCount > 0) {
    const successfulResults = results.filter(r => r.success);
    const avgTime = successfulResults.reduce((sum, r) => sum + r.elapsed, 0) / successCount;
    console.log(`⏱️  Average response time: ${Math.round(avgTime)}ms`);
    console.log(`💡 Recommended timeout: ${Math.round(avgTime * 2)}ms (2x average)`);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExperiments().catch(error => {
    console.error('❌ Experiment failed:', error);
    process.exit(1);
  });
}

export { testWithTimeout, runExperiments };
