#!/usr/bin/env node

/**
 * Test script to validate private channel link handling
 * This script tests how the application handles t.me/c/CHANNEL_ID/MESSAGE_ID links
 */

import { TelegramUserClient } from '../telegram.lib.mjs';

async function testPrivateChannelLinkHandling() {
  console.log('🧪 Testing Private Channel Link Handling\n');
  console.log('='.repeat(50));

  const client = new TelegramUserClient();

  // Test cases
  const testLinks = [
    't.me/c/2231417118/5',  // Example from issue #11
    't.me/c/1234567890/1',  // Generic test case
  ];

  for (const link of testLinks) {
    console.log(`\n📝 Testing: ${link}`);

    const parsed = client.parseInviteLink(`https://${link}`);
    console.log(`   Type: ${parsed?.type || 'unknown'}`);
    console.log(`   Channel ID: ${parsed?.channelId || 'N/A'}`);

    if (parsed?.type === 'private_channel') {
      console.log('   ✅ Correctly identified as private_channel type');
      console.log('   ℹ️  Expected behavior: Should check if user is member');
      console.log('   ℹ️  If not member: Show clear error that invite link is needed');
      console.log('   ℹ️  Should NOT throw unhandled CHANNEL_INVALID error');
    } else {
      console.log('   ❌ Not identified correctly');
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Test completed\n');

  console.log('📋 Expected Fix:');
  console.log('   1. Catch CHANNEL_INVALID error specifically');
  console.log('   2. Provide clear message about needing invite link');
  console.log('   3. Mark as failed (not crashed) in results');
  console.log('   4. Continue processing other links');
}

// Run test
testPrivateChannelLinkHandling().catch(error => {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
});
