#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { VKClient } from './vk.lib.mjs';
import { lino } from "./lino.lib.mjs";
import { CACHE_FILES } from "./cache-files.mjs";

class TelegramLinkExtractor {
  constructor() {
    try {
      this.client = new VKClient();
    } catch (error) {
      console.error(`❌ ${error.message}`);
      console.log('💡 Set VK_ACCESS_TOKEN in .env file or as environment variable');
      process.exit(1);
    }
  }


  extractTelegramLinks(text) {
    if (!text) return [];

    // Match various t.me link formats
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?t\.me\/\+[A-Za-z0-9_-]+/gi, // Private invite links (t.me/+hash)
      /(?:https?:\/\/)?(?:www\.)?t\.me\/(?:c\/[\d]+\/[\d]+|[\w_]+)/gi, // Public channels and private channel message links
      /(?:https?:\/\/)?(?:www\.)?telegram\.me\/\+[A-Za-z0-9_-]+/gi, // Private invite links (telegram.me)
      /(?:https?:\/\/)?(?:www\.)?telegram\.me\/[\w_]+/gi, // Public channels (telegram.me)
      /@[\w_]+/g // Also capture @username mentions that might be Telegram
    ];

    const links = new Set();

    patterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        // Convert @username to t.me link format
        if (match.startsWith('@')) {
          links.add(`t.me/${match.substring(1)}`);
        } else {
          // Normalize the link to t.me format without protocol
          const normalized = match
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace('telegram.me/', 't.me/');
          links.add(normalized);
        }
      });
    });

    return Array.from(links);
  }

  async extractFromChatIds(chatIds, options = {}) {
    try {
      console.log(`🔍 Extracting Telegram links from ${chatIds.length} chat(s)...\n`);
      
      const allLinks = new Set();
      const linksByChat = {};
      const linkContexts = new Map(); // Store message context for each link
      
      // Process each chat ID
      for (const chatId of chatIds) {
        const peerId = 2000000000 + parseInt(chatId);
        
        if (options.verbose) {
          console.log(`📋 Processing chat ID: ${chatId} (peer_id: ${peerId})`);
        }
        
        try {
          // Get chat info if needed for display
          let chatTitle = `Chat ${chatId}`;
          if (options.verbose || options.byChat) {
            try {
              const conversation = await this.client.getConversationById(peerId);
              if (conversation.items?.[0]) {
                chatTitle = conversation.items[0].chat_settings?.title || chatTitle;
              }
            } catch (err) {
              // If we can't get chat info, continue with default title
            }
          }
          
          // Get current user ID if filtering incoming messages
          let currentUserId = null;
          if (options.incomingOnly) {
            const currentUser = await this.client.vk.api.users.get({});
            currentUserId = currentUser[0].id;
          }
          
          // Get message history for this chat
          const messages = await this.client.vk.api.messages.getHistory({
            peer_id: peerId,
            count: options.messagesPerChat,
            offset: 0
          });
          
          const chatLinks = new Set();
          
          // Extract links from each message
          messages.items.forEach(message => {
            // Filter incoming only if requested
            if (options.incomingOnly && message.from_id === currentUserId) {
              return; // Skip outgoing messages
            }
            
            if (message.text) {
              const links = this.extractTelegramLinks(message.text);
              links.forEach(link => {
                chatLinks.add(link);
                allLinks.add(link);
                
                // Store message context for verbose output
                if (options.verbose && !linkContexts.has(link)) {
                  const preview = message.text.length > 100 
                    ? message.text.substring(0, 100) + '...'
                    : message.text;
                  linkContexts.set(link, {
                    chatTitle,
                    chatId,
                    message: preview,
                    fromId: message.from_id
                  });
                }
              });
            }
            
            // Also check attachments for links
            if (message.attachments) {
              message.attachments.forEach(attachment => {
                if (attachment.type === 'link' && attachment.link?.url) {
                  const links = this.extractTelegramLinks(attachment.link.url);
                  links.forEach(link => {
                    chatLinks.add(link);
                    allLinks.add(link);
                    
                    // Store attachment context for verbose output
                    if (options.verbose && !linkContexts.has(link)) {
                      linkContexts.set(link, {
                        chatTitle,
                        chatId,
                        message: `[Attachment: ${attachment.link.title || attachment.link.url}]`,
                        fromId: message.from_id
                      });
                    }
                  });
                }
              });
            }
          });
          
          if (chatLinks.size > 0) {
            linksByChat[`[${chatId}] ${chatTitle}`] = Array.from(chatLinks);
            if (options.verbose) {
              console.log(`   Found ${chatLinks.size} unique link(s)`);
            }
          } else if (options.verbose) {
            console.log(`   No Telegram links found`);
          }
          
        } catch (error) {
          console.error(`   ❌ Error processing chat ${chatId}: ${error.message}`);
        }
      }
      
      // Display results
      console.log('\n' + '='.repeat(50));
      console.log('📊 SUMMARY');
      console.log('='.repeat(50));
      
      if (options.byChat) {
        console.log('\n📁 Links by chat:\n');
        Object.entries(linksByChat).forEach(([chatName, links]) => {
          console.log(`${chatName}:`);
          links.forEach(link => console.log(`  • ${link}`));
          console.log();
        });
      }
      
      console.log(`\n🔗 All unique Telegram links (${allLinks.size} total):\n`);
      const sortedLinks = Array.from(allLinks).sort();
      
      if (options.verbose && linkContexts.size > 0) {
        sortedLinks.forEach(link => {
          console.log(`• ${link}`);
          const context = linkContexts.get(link);
          if (context) {
            console.log(`  📝 From: [${context.chatId}] ${context.chatTitle}`);
            console.log(`  💬 Message: "${context.message}"`);
            console.log();
          }
        });
      }
      
      if (options.json) {
        console.log('\n📄 JSON output:');
        const output = {
          total: allLinks.size,
          links: sortedLinks,
          ...(options.byChat && { linksByChat })
        };
        console.log(JSON.stringify(output, null, 2));
      }
      
      // Always output in Links Notation format
      console.log('\n📄 Links Notation output:');
      console.log(lino.format(sortedLinks));
      
      // Save to cache
      const cacheFile = lino.saveAsLino(CACHE_FILES.TELEGRAM_LINKS, sortedLinks);
      console.log(`\n💾 Saved to cache: ${cacheFile}`);
      
      return allLinks;
      
    } catch (error) {
      console.error('❌ Failed to extract links:', error.message);
      if (error.code === 5) {
        console.log('💡 Make sure your VK access token has messages permission');
      }
      throw error;
    }
  }
}

yargs(hideBin(process.argv))
  .scriptName('vk-extract-telegram-links')
  .usage('$0 [chatIds] [options]')
  .command('$0 [chatIds]', 'Extract unique Telegram links from specified VK chat IDs', {
    chatIds: {
      describe: 'Chat IDs to extract links from (supports Links Notation). If not provided, uses cached vk-chats.lino',
      type: 'string',
      coerce: (input) => {
        // If no input provided, try to use cached file
        if (!input) {
          const cache = lino.requireFile(CACHE_FILES.VK_CHATS, 
            'No chat IDs provided and cache file not found.\n💡 Run vk-list-chats.mjs first to create the cache file');
          return cache.numericIds;
        }
        // Parse Links Notation input
        return lino.parseNumericIds(input);
      }
    }
  }, async (argv) => {
    const extractor = new TelegramLinkExtractor();
    // Handle case where no argument was provided
    let chatIds = argv.chatIds;
    if (!chatIds) {
      const cache = lino.requireFile(CACHE_FILES.VK_CHATS, 
        'No chat IDs provided and cache file not found.\n💡 Run vk-list-chats.mjs first to create the cache file');
      chatIds = cache.numericIds;
    }
    await extractor.extractFromChatIds(chatIds, argv);
  })
  .option('messages-per-chat', {
    alias: 'm',
    describe: 'Number of messages to fetch per chat',
    type: 'number',
    default: 200
  })
  .option('by-chat', {
    alias: 'c',
    describe: 'Show links grouped by chat',
    type: 'boolean',
    default: false
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Show detailed progress and message context for links',
    type: 'boolean',
    default: false
  })
  .option('incoming-only', {
    alias: 'i',
    describe: 'Only extract links from incoming messages (not your own)',
    type: 'boolean',
    default: false
  })
  .option('json', {
    alias: 'j',
    describe: 'Output as JSON',
    type: 'boolean',
    default: false
  })
  .help()
  .example('$0', 'Extract links using cached chat IDs from ~/.follow/vk-chats.lino')
  .example('$0 "1163 1158 1159 1162"', 'Extract links from 4 specific chats')
  .example('$0 "(1163 1158 1159 1162)"', 'Using Links Notation for chat IDs')
  .example('$0 --incoming-only', 'Extract only from incoming messages using cached chats')
  .example('$0 "(1163 1158 1159 1162)" --incoming-only', 'Links Notation with incoming-only filter')
  .example('$0 "1163" --by-chat --verbose', 'Extract with message context grouped by chat')
  .example('$0 "1163 1158" -m 500 --json', 'Fetch 500 messages per chat and output as JSON')
  .argv;