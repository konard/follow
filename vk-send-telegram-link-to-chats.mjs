#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { VKClient } from './vk.lib.mjs';
import { lino, CACHE_FILES } from './lino.lib.mjs';

class TelegramLinkSender {
  constructor() {
    try {
      this.client = new VKClient();
    } catch (error) {
      console.error(`❌ ${error.message}`);
      console.log('💡 Set VK_ACCESS_TOKEN in .env file or as environment variable');
      process.exit(1);
    }
    this.sentMessages = new Map();
  }

  async sendLinkToChatIds(chatIds, telegramLink, options = {}) {
    try {
      console.log(`📤 Sending Telegram link to ${chatIds.length} chat(s)...`);
      console.log(`🔗 Link: ${telegramLink}\n`);
      
      const monitorDuration = options.monitorDuration;
      const checkInterval = options.checkInterval;
      
      for (const chatId of chatIds) {
        const peerId = 2000000000 + parseInt(chatId);
        
        if (options.verbose) {
          console.log(`📋 Processing chat ID: ${chatId} (peer_id: ${peerId})`);
        }
        
        try {
          let chatTitle = `Chat ${chatId}`;
          try {
            const conversation = await this.client.getConversationById(peerId);
            if (conversation.items?.[0]) {
              chatTitle = conversation.items[0].chat_settings?.title || chatTitle;
            }
          } catch (err) {
            // Continue with default title if can't get chat info
          }
          
          const result = await this.client.sendMessage(peerId, telegramLink);
          const messageId = result;
          
          this.sentMessages.set(messageId, {
            chatId,
            chatTitle,
            peerId,
            sentAt: Date.now(),
            deleted: false
          });
          
          console.log(`✅ Sent to [${chatId}] ${chatTitle} (message ID: ${messageId})`);
          
          if (options.delay) {
            await new Promise(resolve => setTimeout(resolve, options.delay * 1000));
          }
          
        } catch (error) {
          console.error(`❌ Error sending to chat ${chatId}: ${error.message}`);
        }
      }
      
      console.log(`\n⏳ Monitoring messages for ${monitorDuration / 1000} seconds...`);
      console.log(`🔍 Checking every ${checkInterval / 1000} seconds\n`);
      
      const startMonitoring = Date.now();
      let checkCount = 0;
      
      while (Date.now() - startMonitoring < monitorDuration) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        checkCount++;
        
        // Count current status
        let activeCount = 0;
        let deletedCount = 0;
        for (const info of this.sentMessages.values()) {
          if (info.deleted) {
            deletedCount++;
          } else {
            activeCount++;
          }
        }
        
        if (options.verbose) {
          console.log(`🔄 Check #${checkCount} at ${new Date().toLocaleTimeString()} (Active: ${activeCount}, Deleted: ${deletedCount})`);
        }
        
        // Only check messages that haven't been deleted yet
        const messagesToCheck = [];
        for (const [messageId, info] of this.sentMessages.entries()) {
          if (!info.deleted) {
            messagesToCheck.push(messageId);
          }
        }
        
        if (messagesToCheck.length === 0) {
          if (!options.verbose) {
            console.log(`📊 All messages have been deleted. Ending monitoring early.`);
          }
          break;
        }
        
        for (const messageId of messagesToCheck) {
          const info = this.sentMessages.get(messageId);
          
          try {
            const messages = await this.client.vk.api.messages.getById({
              message_ids: messageId
            });
            
            if (!messages.items || messages.items.length === 0 || 
                messages.items[0]?.deleted === 1 || 
                messages.items[0]?.is_unavailable === true) {
              info.deleted = true;
              const age = ((Date.now() - info.sentAt) / 1000).toFixed(1);
              console.log(`❌ Message ${messageId} deleted in [${info.chatId}] ${info.chatTitle} after ${age}s`);
            } else if (options.verbose) {
              console.log(`  ✓ Message ${messageId} still exists in [${info.chatId}] ${info.chatTitle}`);
            }
          } catch (error) {
            if (error.code === 100) {
              info.deleted = true;
              const age = ((Date.now() - info.sentAt) / 1000).toFixed(1);
              console.log(`❌ Message ${messageId} deleted in [${info.chatId}] ${info.chatTitle} after ${age}s`);
            } else if (options.verbose) {
              console.log(`  ⚠️ Error checking message ${messageId}: ${error.message}`);
            }
          }
        }
      }
      
      console.log('\n' + '='.repeat(50));
      console.log('📊 FINAL RESULTS');
      console.log('='.repeat(50) + '\n');
      
      const survived = [];
      const deleted = [];
      
      for (const [messageId, info] of this.sentMessages.entries()) {
        if (info.deleted) {
          deleted.push({ messageId, ...info });
        } else {
          survived.push({ messageId, ...info });
        }
      }
      
      console.log(`✅ Survived: ${survived.length}/${this.sentMessages.size}`);
      if (survived.length > 0) {
        survived.forEach(msg => {
          console.log(`   • [${msg.chatId}] ${msg.chatTitle} (message ID: ${msg.messageId})`);
        });

        // Delete all incoming messages if option is enabled
        if (options.deleteAllIncomingMessagesInChatOnSuccess) {
          console.log(`\n🗑️  Deleting all incoming messages in chats where our message survived...`);

          const vipRestrictedChats = [];
          const permissionDeniedChats = [];
          const successfullyCleanedChats = [];

          for (const msg of survived) {
            try {
              // Get conversation history
              const history = await this.client.vk.api.messages.getHistory({
                peer_id: msg.peerId,
                count: 200
              });

              const messagesToDelete = [];
              for (const message of history.items) {
                // Delete only incoming messages (out: 0), not our own (out: 1)
                if (message.out === 0) {
                  messagesToDelete.push(message.id);
                }
              }

              if (messagesToDelete.length > 0) {
                // VK allows deleting multiple messages at once
                await this.client.vk.api.messages.delete({
                  message_ids: messagesToDelete.join(','),
                  delete_for_all: 0 // Delete only for ourselves
                });
                console.log(`   ✅ Deleted ${messagesToDelete.length} incoming message(s) in [${msg.chatId}] ${msg.chatTitle}`);
                successfullyCleanedChats.push(msg);
              } else {
                console.log(`   ℹ️  No incoming messages to delete in [${msg.chatId}] ${msg.chatTitle}`);
              }
            } catch (error) {
              // Handle VIP subscription and permission errors gracefully
              const errorCode = error.code || error.error_code;

              if (errorCode === 962) {
                console.log(`   💎 [${msg.chatId}] ${msg.chatTitle}: VIP subscription required to delete messages - skipping`);
                vipRestrictedChats.push({ ...msg, errorCode, errorType: 'VIP subscription required' });
              } else if (errorCode === 924) {
                console.log(`   ⚠️  [${msg.chatId}] ${msg.chatTitle}: Cannot delete messages for everyone - permission denied`);
                permissionDeniedChats.push({ ...msg, errorCode, errorType: 'Cannot delete for everyone' });
              } else if (errorCode === 15 || errorCode === 7) {
                console.log(`   ⚠️  [${msg.chatId}] ${msg.chatTitle}: Access denied - insufficient permissions to delete messages`);
                permissionDeniedChats.push({ ...msg, errorCode, errorType: 'Access denied' });
              } else if (errorCode === 1256 || errorCode === 1257) {
                console.log(`   💎 [${msg.chatId}] ${msg.chatTitle}: Subscription issue detected (${errorCode}) - skipping`);
                vipRestrictedChats.push({ ...msg, errorCode, errorType: `Subscription issue (${errorCode})` });
              } else {
                console.error(`   ❌ Error deleting messages in [${msg.chatId}] ${msg.chatTitle}: ${error.message}${errorCode ? ` (code: ${errorCode})` : ''}`);
              }
            }
          }

          // Report deletion summary
          if (successfullyCleanedChats.length > 0 || vipRestrictedChats.length > 0 || permissionDeniedChats.length > 0) {
            console.log('\n' + '-'.repeat(50));
            console.log('🗑️  MESSAGE DELETION SUMMARY');
            console.log('-'.repeat(50));

            if (successfullyCleanedChats.length > 0) {
              console.log(`\n✅ Successfully cleaned ${successfullyCleanedChats.length} chat(s)`);
            }

            if (vipRestrictedChats.length > 0) {
              console.log(`\n💎 VIP subscription required (${vipRestrictedChats.length} chat(s)):`);
              vipRestrictedChats.forEach(chat => {
                console.log(`   • [${chat.chatId}] ${chat.chatTitle} - ${chat.errorType}`);
              });
            }

            if (permissionDeniedChats.length > 0) {
              console.log(`\n⚠️  Permission denied (${permissionDeniedChats.length} chat(s)):`);
              permissionDeniedChats.forEach(chat => {
                console.log(`   • [${chat.chatId}] ${chat.chatTitle} - ${chat.errorType}`);
              });
            }
          }
        }
      }
      
      console.log(`\n❌ Deleted: ${deleted.length}/${this.sentMessages.size}`);
      if (deleted.length > 0) {
        deleted.forEach(msg => {
          const age = ((Date.now() - msg.sentAt) / 1000).toFixed(1);
          console.log(`   • [${msg.chatId}] ${msg.chatTitle} (deleted after ${age}s)`);
        });
      }
      
      if (deleted.length === 0) {
        console.log('\n🎉 SUCCESS! No messages were deleted by admin bots.');
        process.exit(0);
      } else {
        console.log('\n⚠️ PARTIAL SUCCESS: Some messages were deleted.');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Failed to send links:', error.message);
      throw error;
    }
  }
}

yargs(hideBin(process.argv))
  .scriptName('vk-send-telegram-link-to-chats')
  .usage('$0 [chatIds] [options]')
  .command('$0 [chatIds]', 'Send a Telegram link to specified VK chat IDs and monitor for deletions', {
    chatIds: {
      describe: 'Chat IDs to send link to (supports Links Notation). If not provided, uses cached vk-chats.lino',
      type: 'string',
      coerce: (input) => {
        if (!input) {
          const cache = lino.requireCache(CACHE_FILES.VK_CHATS, 
            'No chat IDs provided and cache file not found.\n💡 Run vk-list-chats.mjs first to create the cache file');
          return cache.numericIds;
        }
        return lino.parseNumericIds(input);
      }
    }
  }, async (argv) => {
    const sender = new TelegramLinkSender();
    let chatIds = argv.chatIds;
    if (!chatIds) {
      const cache = lino.requireCache(CACHE_FILES.VK_CHATS, 
        'No chat IDs provided and cache file not found.\n💡 Run vk-list-chats.mjs first to create the cache file');
      chatIds = cache.numericIds;
    }
    await sender.sendLinkToChatIds(chatIds, argv.link, argv);
  })
  .option('link', {
    alias: 'l',
    describe: 'Telegram link to send',
    type: 'string',
    default: 'https://t.me/gptDeep'
  })
  .option('monitor-duration', {
    alias: 'd',
    describe: 'Duration to monitor messages in milliseconds',
    type: 'number',
    default: 200000
  })
  .option('check-interval', {
    alias: 'i',
    describe: 'Interval between checks in milliseconds',
    type: 'number',
    default: 30000
  })
  .option('delay', {
    describe: 'Delay between sending messages to different chats (in seconds)',
    type: 'number',
    default: 0
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Show detailed progress',
    type: 'boolean',
    default: false
  })
  .option('delete-all-incoming-messages-in-chat-on-success', {
    describe: 'Delete all incoming messages in chats where our message survived after monitoring',
    type: 'boolean',
    default: false
  })
  .help()
  .example('$0', 'Send https://t.me/gptDeep to cached chats and monitor for 3 minutes')
  .example('$0 --link https://t.me/myChannel', 'Send custom link to cached chats')
  .example('$0 "1163 1158 1159" --link https://t.me/myChannel', 'Send to specific chats')
  .example('$0 "(1163 1158)" --delay 2', 'Send with 2 second delay between chats')
  .example('$0 --monitor-duration 300000 --check-interval 15000', 'Monitor for 5 minutes, check every 15 seconds')
  .example('$0 --verbose', 'Show detailed monitoring information')
  .example('$0 --delete-all-incoming-messages-in-chat-on-success', 'Delete incoming messages after successful monitoring')
  .argv;