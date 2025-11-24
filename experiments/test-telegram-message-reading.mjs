#!/usr/bin/env node

/**
 * Experiment script to test reading Telegram messages from a channel
 *
 * This script demonstrates the new functionality added in issue #5:
 * - Connect to Telegram
 * - Read recent messages from a public channel
 * - Extract Telegram links from those messages
 *
 * Usage:
 *   bun run experiments/test-telegram-message-reading.mjs <channel_username>
 *
 * Example:
 *   bun run experiments/test-telegram-message-reading.mjs link_konard
 */

import { TelegramUserClient } from '../telegram.lib.mjs';

async function testTelegramMessageReading(channelUsername) {
  console.log(`🧪 Experiment: Testing Telegram message reading from @${channelUsername}\n`);

  const client = new TelegramUserClient();

  try {
    console.log('📱 Connecting to Telegram...');
    await client.connect();
    console.log('✅ Connected!\n');

    console.log(`🔍 Getting entity for @${channelUsername}...`);
    const entity = await client.getEntity(channelUsername);
    console.log(`✅ Found: ${entity.title || entity.username}\n`);

    console.log('📬 Fetching recent messages...');
    const messages = await client.getMessages(entity, 10);
    console.log(`✅ Retrieved ${messages.length} messages\n`);

    console.log('📝 Message content:');
    console.log('='.repeat(50));

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      console.log(`\nMessage ${i + 1}:`);
      console.log(`  Date: ${msg.date}`);
      console.log(`  Text: ${msg.text || '(no text)'}`);

      // Extract Telegram links
      if (msg.text) {
        const linkPattern = /(?:https?:\/\/)?(?:www\.)?t\.me\/[\w_]+/gi;
        const links = msg.text.match(linkPattern);
        if (links) {
          console.log(`  Links found: ${links.join(', ')}`);
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Experiment completed successfully!');

  } catch (error) {
    console.error('\n❌ Experiment failed:', error.message);
    console.error(error);
  } finally {
    await client.disconnect();
    console.log('\n👋 Disconnected from Telegram');
  }
}

// Get channel username from command line
const channelUsername = process.argv[2];

if (!channelUsername) {
  console.error('❌ Usage: bun run experiments/test-telegram-message-reading.mjs <channel_username>');
  console.error('   Example: bun run experiments/test-telegram-message-reading.mjs link_konard');
  process.exit(1);
}

testTelegramMessageReading(channelUsername);
