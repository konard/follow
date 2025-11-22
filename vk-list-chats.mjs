#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { VKClient } from './vk.lib.mjs';
import { lino } from "./lino.lib.mjs";
import { CACHE_FILES } from "./cache-files.mjs";

class VKChatLister {
  constructor() {
    try {
      this.client = new VKClient();
    } catch (error) {
      console.error(`❌ ${error.message}`);
      console.log('💡 Set VK_ACCESS_TOKEN in .env file or as environment variable');
      process.exit(1);
    }
  }

  /**
   * Retry operation with exponential backoff
   * @param {Function} operation - The async operation to retry
   * @param {string} operationName - Name of the operation for logging
   * @param {number} maxRetries - Maximum number of retries
   * @returns {Promise<*>} Result of the operation
   */
  async retryOperation(operation, operationName = 'operation', maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if it's a timeout/abort error
        const isTimeoutError = error.type === 'aborted' ||
                              error.message?.includes('aborted') ||
                              error.code === 'ABORT_ERR';

        if (isTimeoutError && attempt < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`⏳ Timeout during ${operationName} (attempt ${attempt}/${maxRetries})`);
          console.log(`   Retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        // If it's not a timeout error or we're out of retries, throw
        throw error;
      }
    }

    throw lastError;
  }


  async getGroupChats(options = {}) {
    try {
      console.log('🔍 Fetching group chats...\n');

      // Get conversations with retry logic
      const conversations = await this.retryOperation(
        () => this.client.getConversations({
          count: options.limit,
          offset: options.offset,
          fields: 'photo_100,members_count'
        }),
        'fetching conversations'
      );

      let chats = conversations.items.filter(item => 
        item.conversation.peer.type === 'chat'
      );

      // Apply Telegram filter if requested
      if (options.filterTelegramChats) {
        const telegramKeywords = ['telegram', 'телеграм', 'тг'];
        chats = chats.filter(item => {
          const title = (item.conversation.chat_settings?.title || '').toLowerCase();
          return telegramKeywords.some(keyword => title.includes(keyword));
        });
      }

      if (chats.length === 0) {
        console.log('No group chats found');
        return [];
      }

      console.log(`Found ${chats.length} group chat(s):\n`);
      
      const chatList = [];
      
      for (const item of chats) {
        const chat = item.conversation;
        const chatInfo = {
          id: chat.peer.local_id,
          title: chat.chat_settings?.title || 'Unnamed chat',
          members: chat.chat_settings?.members_count || 0,
          admin: chat.chat_settings?.owner_id,
          photo: chat.chat_settings?.photo?.photo_100,
          canWrite: chat.can_write?.allowed || false,
          lastMessage: item.last_message?.text?.substring(0, 50)
        };
        
        chatList.push(chatInfo);
        
        if (options.verbose) {
          console.log(`📋 Chat ID: ${chatInfo.id}`);
          console.log(`   Title: ${chatInfo.title}`);
          console.log(`   Members: ${chatInfo.members}`);
          console.log(`   Can write: ${chatInfo.canWrite ? '✅' : '❌'}`);
          if (chatInfo.lastMessage) {
            console.log(`   Last message: ${chatInfo.lastMessage}...`);
          }
          console.log();
        } else {
          console.log(`• [${chatInfo.id}] ${chatInfo.title} (${chatInfo.members} members)`);
        }
      }
      
      if (options.json) {
        console.log('\nJSON output:');
        console.log(JSON.stringify(chatList, null, 2));
      }
      
      // Always output chat IDs in Links Notation format
      const chatIds = chatList.map(chat => chat.id);
      console.log('\n📄 Links Notation output:');
      console.log(lino.format(chatIds));
      
      // Save to cache
      const cacheFile = lino.saveAsLino(CACHE_FILES.VK_CHATS, chatIds);
      console.log(`💾 Saved to cache: ${cacheFile}`);
      
      return chatList;
    } catch (error) {
      console.error('❌ Failed to fetch chats:', error.message);
      if (error.code === 5) {
        console.log('💡 Make sure your VK access token has messages permission');
      }
      throw error;
    }
  }

  async getChatDetails(chatId) {
    try {
      console.log(`🔍 Fetching details for chat ${chatId}...\n`);
      
      const peerId = 2000000000 + parseInt(chatId);
      const conversation = await this.client.getConversationById(peerId);

      if (!conversation.items || conversation.items.length === 0) {
        console.log('Chat not found');
        return null;
      }

      const chat = conversation.items[0];
      const members = await this.client.getConversationMembers(
        peerId,
        'first_name,last_name,screen_name'
      );

      console.log(`📋 Chat: ${chat.chat_settings?.title || 'Unnamed'}`);
      console.log(`   ID: ${chatId}`);
      console.log(`   Members: ${chat.chat_settings?.members_count || 0}`);
      console.log(`   Created by: ${chat.chat_settings?.owner_id}`);
      console.log(`   State: ${chat.chat_settings?.state || 'active'}`);
      
      if (members.items && members.items.length > 0) {
        console.log('\n👥 Members:');
        for (const member of members.items.slice(0, 10)) {
          const user = members.profiles?.find(p => p.id === member.member_id);
          if (user) {
            console.log(`   • ${user.first_name} ${user.last_name} (@${user.screen_name || user.id})`);
          }
        }
        if (members.items.length > 10) {
          console.log(`   ... and ${members.items.length - 10} more`);
        }
      }

      return {
        chat,
        members: members.items
      };
    } catch (error) {
      console.error('❌ Failed to fetch chat details:', error.message);
      throw error;
    }
  }
}

const argv = yargs(hideBin(process.argv))
  .scriptName('vk-list-chats')
  .usage('$0 [options]')
  .command('$0', 'List all VK group chats', {}, async (argv) => {
    const lister = new VKChatLister();
    await lister.getGroupChats(argv);
  })
  .command('details <chatId>', 'Get details for a specific chat', {
    chatId: {
      describe: 'Chat ID to get details for',
      type: 'number'
    }
  }, async (argv) => {
    const lister = new VKChatLister();
    await lister.getChatDetails(argv.chatId);
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Show detailed information',
    type: 'boolean',
    default: false
  })
  .option('json', {
    alias: 'j',
    describe: 'Output as JSON',
    type: 'boolean',
    default: false
  })
  .option('limit', {
    alias: 'l',
    describe: 'Maximum number of chats to fetch',
    type: 'number',
    default: 200
  })
  .option('offset', {
    alias: 'o',
    describe: 'Offset for pagination',
    type: 'number',
    default: 0
  })
  .option('filter-telegram-chats', {
    describe: 'Show only chats with Telegram/ТГ/Телеграм in the name',
    type: 'boolean',
    default: false
  })
  .help()
  .argv;