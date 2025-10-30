#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { spawn } from 'child_process';
import { lino, CACHE_FILES } from './lino.lib.mjs';

class AutoFollower {
  constructor(options = {}) {
    this.options = options;
    this.verbose = options.verbose || false;
  }

  /**
   * Execute a script and wait for it to complete
   */
  async executeScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
      if (this.verbose) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🚀 Executing: ${scriptPath} ${args.join(' ')}`);
        console.log('='.repeat(60));
      }

      const child = spawn(scriptPath, args, {
        stdio: 'inherit',
        shell: true
      });

      child.on('close', (code) => {
        if (this.verbose) {
          console.log(`\n✓ ${scriptPath} completed with exit code: ${code}`);
        }

        // Don't reject on non-zero exit codes, just resolve with the code
        resolve(code);
      });

      child.on('error', (error) => {
        console.error(`\n❌ Error executing ${scriptPath}:`, error.message);
        reject(error);
      });
    });
  }

  /**
   * Check if VK_CHATS cache has any rejected chats
   */
  hasRejectedChats() {
    try {
      const cache = lino.loadFromCache(CACHE_FILES.VK_CHATS);
      if (!cache || !cache.numericIds || cache.numericIds.length === 0) {
        return false;
      }
      if (this.verbose) {
        console.log(`\n📋 Found ${cache.numericIds.length} chat(s) in ${CACHE_FILES.VK_CHATS}`);
      }
      return true;
    } catch (error) {
      if (this.verbose) {
        console.log(`\n📋 No ${CACHE_FILES.VK_CHATS} found or it's empty`);
      }
      return false;
    }
  }

  /**
   * Execute the complete auto-follow sequence
   */
  async run() {
    console.log('🤖 Starting Auto-Follow Sequence\n');

    try {
      // Step 1: List VK chats to discover chats with Telegram in name
      console.log('\n📋 STEP 1: Listing VK chats with Telegram in name...');
      await this.executeScript('./vk-list-chats.mjs', ['--filter-telegram-chats']);

      // Step 2: Extract Telegram links from VK chats
      console.log('\n🔗 STEP 2: Extracting Telegram links from VK chats...');
      await this.executeScript('./vk-extract-telegram-links.mjs', ['--incoming-only']);

      // Step 3: Follow extracted Telegram channels/groups
      console.log('\n📱 STEP 3: Following Telegram channels/groups...');
      await this.executeScript('./telegram-follow.mjs', ['--mute', '--archive']);

      // Step 4: Send our Telegram link back to VK chats
      console.log('\n📤 STEP 4: Sending Telegram link to VK chats...');
      const exitCode = await this.executeScript('./vk-send-telegram-link-to-chats.mjs', [
        '--delete-all-incoming-messages-in-chat-on-success'
      ]);

      // If all messages survived on first attempt, we're done
      if (exitCode === 0) {
        console.log('\n🎉 All messages survived on first attempt! No retries needed.');
        console.log('\n' + '='.repeat(60));
        console.log('✅ Auto-Follow Sequence Complete!');
        console.log('='.repeat(60));
        return;
      }

      // Loop: Repeat steps 2-4 while there are rejected chats
      let iteration = 1;
      const maxIterations = 10; // Safety limit to prevent infinite loops

      while (this.hasRejectedChats() && iteration <= maxIterations) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔄 RETRY ITERATION ${iteration}: Processing rejected chats...`);
        console.log('='.repeat(60));

        // Step 2: Extract Telegram links from rejected chats
        console.log('\n🔗 STEP 2: Extracting Telegram links from rejected VK chats...');
        await this.executeScript('./vk-extract-telegram-links.mjs', ['--incoming-only']);

        // Step 3: Follow extracted Telegram channels/groups
        console.log('\n📱 STEP 3: Following Telegram channels/groups...');
        await this.executeScript('./telegram-follow.mjs', ['--mute', '--archive']);

        // Step 4: Send our Telegram link back to VK chats
        console.log('\n📤 STEP 4: Sending Telegram link to rejected VK chats...');
        const retryExitCode = await this.executeScript('./vk-send-telegram-link-to-chats.mjs', [
          '--delete-all-incoming-messages-in-chat-on-success'
        ]);

        // If all messages survived, we're done
        if (retryExitCode === 0) {
          console.log('\n🎉 All messages survived! No more rejected chats.');
          break;
        }

        iteration++;
      }

      if (iteration > maxIterations) {
        console.log(`\n⚠️  Reached maximum iteration limit (${maxIterations}). Stopping.`);
      }

      console.log('\n' + '='.repeat(60));
      console.log('✅ Auto-Follow Sequence Complete!');
      console.log('='.repeat(60));

    } catch (error) {
      console.error('\n❌ Auto-Follow sequence failed:', error.message);
      if (this.verbose) {
        console.error(error);
      }
      process.exit(1);
    }
  }
}

yargs(hideBin(process.argv))
  .scriptName('auto-follow')
  .usage('$0 [options]')
  .command('$0', 'Execute the complete auto-follow sequence', {}, async (argv) => {
    const follower = new AutoFollower(argv);
    await follower.run();
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Show detailed progress',
    type: 'boolean',
    default: false
  })
  .help()
  .example('$0', 'Run the complete auto-follow sequence')
  .example('$0 --verbose', 'Run with detailed progress output')
  .argv;
