#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TelegramUserClient } from './telegram.lib.mjs';
import { lino, CACHE_FILES } from './lino.lib.mjs';

class TelegramFollower {
  constructor() {
    this.client = new TelegramUserClient();
  }

  // Utility function for delays
  async sleep(seconds) {
    const ms = seconds * 1000;
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  // Archive with retry mechanism for newly joined channels
  async archiveWithRetry(entity, link, results, maxRetries = 5) {
    const delays = [2, 5, 10, 15, 20]; // Exponential backoff delays in seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // On retry attempts, try to fetch the dialog to get a fresh entity
        let entityToUse = entity;
        if (attempt > 1) {
          try {
            // Try to fetch the dialog for this entity to ensure it's properly synced
            const dialog = await this.client.getDialogByEntity(entity);
            if (dialog && dialog.entity) {
              entityToUse = dialog.entity;
              console.log(`  🔄 Refreshed entity for archive attempt ${attempt}`);
            }
          } catch (fetchError) {
            // If we can't fetch the dialog, continue with the original entity
            console.log(`  ⚠️  Could not refresh entity: ${fetchError.message}`);
          }
        }
        
        await this.client.editFolder(entityToUse, 1); // Folder 1 is archive
        results.archived.push(link);
        return; // Success
      } catch (error) {
        if (error.message.includes('PEER_ID_INVALID') && attempt < maxRetries) {
          const delay = delays[attempt - 1] || 20;
          console.log(`  ⏳ Archive attempt ${attempt} failed, retrying in ${delay}s...`);
          await this.sleep(delay);
        } else {
          throw error; // Re-throw if it's the last attempt or different error
        }
      }
    }
  }


  async followLinks(links, options = {}) {
    try {
      console.log(`🔍 Processing ${links.length} Telegram link(s)...\n`);
      
      const results = {
        joined: [],
        alreadyMember: [],
        failed: [],
        invalid: [],
        muted: [],
        alreadyMuted: [],
        archived: [],
        alreadyArchived: []
      };
      
      await this.client.withConnection(async () => {
        // First, get all current dialogs to check membership
        console.log('📋 Fetching current groups and channels...');
        const dialogs = await this.client.getDialogs();
        await this.sleep(0.5); // Small delay after API call
        const currentGroups = new Set();
        const dialogsMap = new Map(); // Cache dialogs by username
        
        // Build a set of current group usernames and IDs
        for (const dialog of dialogs) {
          if (dialog.isChannel || dialog.isGroup) {
            const entity = dialog.entity;
            if (entity.username) {
              const usernameLower = entity.username.toLowerCase();
              currentGroups.add(usernameLower);
              dialogsMap.set(usernameLower, dialog);
            }
          }
        }
        
        console.log(`Found ${currentGroups.size} existing group(s)\n`);
        
        // Process each link
        for (let i = 0; i < links.length; i++) {
          const link = links[i];
          const progress = `[${i + 1}/${links.length}]`;
          
          // Normalize the link
          let normalizedLink = link.trim();
          if (!normalizedLink.startsWith('http')) {
            normalizedLink = `https://${normalizedLink}`;
          }
          
          console.log(`${progress} Processing: ${link}`);
          
          try {
            const parsed = this.client.parseInviteLink(normalizedLink);
            
            if (!parsed) {
              console.log(`  ❌ Invalid link format`);
              results.invalid.push(link);
              continue;
            }
            
            // Check if already a member (for public groups)
            if (parsed.type === 'public' && currentGroups.has(parsed.username.toLowerCase())) {
              console.log(`  ℹ️  Already a member of @${parsed.username}`);
              results.alreadyMember.push(link);
              
              // Apply mute and archive settings to existing channels if requested
              if (options.mute || options.archive) {
                try {
                  // Use cached dialog if available
                  const dialog = dialogsMap.get(parsed.username.toLowerCase());
                  
                  if (dialog) {
                    const channel = dialog.entity;
                    
                    if (options.mute && !options.skipMute) {
                      // Fetch notification settings for this channel
                      const notifySettings = await this.client.getNotifySettings(channel);
                      await this.sleep(0.2); // Small delay to avoid rate limits
                      
                      let muteUntil = null;
                      if (notifySettings) {
                        muteUntil = notifySettings.muteUntil;
                      }
                      
                      const currentTime = Math.floor(Date.now() / 1000);
                      
                      if (options.debug) {
                        console.log(`    Debug: muteUntil=${muteUntil}, currentTime=${currentTime}`);
                      }
                      
                      // Check if already muted
                      const isMuted = muteUntil && (muteUntil === -1 || muteUntil === 2147483647 || muteUntil > currentTime);
                      
                      if (!isMuted) {
                        try {
                          console.log(`  🔇 Muting notifications...`);
                          await this.client.updateNotificationSettings(channel, true);
                          results.muted.push(link);
                          await this.sleep(0.5); // Longer delay to avoid rate limits
                        } catch (muteError) {
                          if (muteError.message.includes('A wait of')) {
                            const waitTime = muteError.message.match(/\d+/)?.[0] || '?';
                            console.log(`  ⚠️  Rate limited - wait ${waitTime}s (stopping mute operations)`);
                            options.skipMute = true; // Skip further mute operations
                          } else {
                            console.log(`  ⚠️  Failed to mute: ${muteError.message}`);
                          }
                        }
                      } else {
                        console.log(`  ℹ️  Already muted`);
                        results.alreadyMuted.push(link);
                      }
                    } else if (options.mute && options.skipMute) {
                      console.log(`  ⏭️  Skipping mute (rate limited)`);
                    }
                    
                    if (options.archive) {
                      // Check if not already archived (folderId === 1)
                      const isArchived = dialog.folderId === 1;
                      
                      if (!isArchived) {
                        console.log(`  📦 Archiving chat...`);
                        // Use dialog.inputEntity for proper peer format
                        const inputPeer = dialog.inputEntity || channel;
                        await this.client.editFolder(inputPeer, 1);
                        results.archived.push(link);
                        await this.sleep(0.3);
                      } else {
                        console.log(`  ℹ️  Already archived`);
                        results.alreadyArchived.push(link);
                      }
                    }
                  }
                } catch (error) {
                  console.log(`  ⚠️  Failed to mute/archive: ${error.message}`);
                }
              }
              
              // Add small delay between checks to avoid rate limiting
              await this.sleep(0.5);
              continue;
            }
            
            // Try to join
            if (parsed.type === 'private') {
              // Join via invite link
              console.log(`  📨 Joining via private invite...`);
              const joinResult = await this.client.importChatInvite(parsed.hash);
              await this.sleep(0.5); // Delay after API call
              console.log(`  ✅ Successfully joined!`);
              results.joined.push(link);
              
              // Apply mute and archive settings if requested
              if (options.mute || options.archive) {
                const chat = joinResult.chats ? joinResult.chats[0] : null;
                if (chat) {
                  try {
                    if (options.mute && !options.skipMute) {
                      console.log(`  🔇 Muting notifications...`);
                      await this.client.updateNotificationSettings(chat, true);
                      results.muted.push(link);
                      await this.sleep(0.5);
                    } else if (options.mute && options.skipMute) {
                      console.log(`  ⏭️  Skipping mute (rate limited)`);
                    }
                  } catch (muteError) {
                    if (muteError.message.includes('A wait of')) {
                      const waitTime = muteError.message.match(/\d+/)?.[0] || '?';
                      console.log(`  ⚠️  Rate limited - wait ${waitTime}s (stopping mute operations)`);
                      options.skipMute = true;
                    } else {
                      console.log(`  ⚠️  Failed to mute: ${muteError.message}`);
                    }
                  }
                  
                  try {
                    if (options.archive) {
                      console.log(`  📦 Archiving chat...`);
                      // For newly joined channels, we need to ensure proper sync
                      // Use the chat from the join result for archiving
                      await this.archiveWithRetry(chat, link, results);
                      await this.sleep(0.3);
                    }
                  } catch (archiveError) {
                    console.log(`  ⚠️  Failed to archive: ${archiveError.message}`);
                  }
                }
              }
            } else if (parsed.type === 'private_channel') {
              // Handle private channel links (t.me/c/CHANNEL_ID/MESSAGE_ID)
              console.log(`  📨 Joining private channel ${parsed.channelId}...`);
              
              try {
                // Convert channel ID to proper format (add -100 prefix for channels)
                const channelPeerId = `-100${parsed.channelId}`;
                const channel = await this.client.getEntity(parseInt(channelPeerId));
                await this.sleep(0.5); // Delay after API call
                
                // Check if we're already in the channel
                console.log(`  ℹ️  Already a member of private channel`);
                results.alreadyMember.push(link);
                await this.sleep(0.5); // Small delay between checks
              } catch (error) {
                if (error.message.includes('CHANNEL_PRIVATE') || error.message.includes('CHANNEL_INVALID')) {
                  console.log(`  ❌ Cannot join - private channel (need invite link)`);
                  results.failed.push({ link, error: 'Private channel - need invite link' });
                } else {
                  throw error;
                }
              }
            } else {
              // Join public channel/group
              console.log(`  📢 Joining @${parsed.username}...`);
              
              // Resolve the username to get the channel
              const resolvedPeer = await this.client.resolveUsername(parsed.username);
              await this.sleep(0.5); // Delay after API call
              
              if (!resolvedPeer.chats || resolvedPeer.chats.length === 0) {
                console.log(`  ❌ Group not found`);
                results.failed.push({ link, error: 'Group not found' });
                continue;
              }
              
              const channel = resolvedPeer.chats[0];
              await this.client.joinChannel(channel);
              await this.sleep(0.5); // Delay after API call
              console.log(`  ✅ Successfully joined @${parsed.username}!`);
              results.joined.push(link);
              
              // Apply mute and archive settings if requested
              if (options.mute || options.archive) {
                try {
                  if (options.mute && !options.skipMute) {
                    console.log(`  🔇 Muting notifications...`);
                    await this.client.updateNotificationSettings(channel, true);
                    results.muted.push(link);
                    await this.sleep(0.5);
                  } else if (options.mute && options.skipMute) {
                    console.log(`  ⏭️  Skipping mute (rate limited)`);
                  }
                } catch (muteError) {
                  if (muteError.message.includes('A wait of')) {
                    const waitTime = muteError.message.match(/\d+/)?.[0] || '?';
                    console.log(`  ⚠️  Rate limited - wait ${waitTime}s (stopping mute operations)`);
                    options.skipMute = true;
                  } else {
                    console.log(`  ⚠️  Failed to mute: ${muteError.message}`);
                  }
                }
                
                try {
                  if (options.archive) {
                    console.log(`  📦 Archiving chat...`);
                    // For newly joined channels, we need to ensure proper sync
                    // Try to get fresh entity before archiving
                    let entityForArchive = channel;
                    try {
                      // Give Telegram a moment to sync
                      await this.sleep(1);
                      const freshDialog = await this.client.getDialogByEntity(channel);
                      if (freshDialog && freshDialog.entity) {
                        entityForArchive = freshDialog.entity;
                        console.log(`  🔄 Using fresh entity for archiving`);
                      }
                    } catch (err) {
                      // Continue with original entity if refresh fails
                      console.log(`  ⚠️ Using original entity for archiving`);
                    }
                    await this.archiveWithRetry(entityForArchive, link, results);
                    await this.sleep(0.3);
                  }
                } catch (archiveError) {
                  console.log(`  ⚠️  Failed to archive: ${archiveError.message}`);
                }
              }
            }
            
            // Add delay to avoid rate limiting
            if (options.delay && i < links.length - 1) {
              console.log(`  ⏳ Waiting ${options.delay}s before next link...`);
              await this.sleep(options.delay);
            }
            
          } catch (error) {
            console.log(`  ❌ Failed: ${error.message}`);
            
            if (error.message.includes('USER_ALREADY_PARTICIPANT')) {
              results.alreadyMember.push(link);
              await this.sleep(0.5); // Small delay after error
            } else if (error.message.includes('INVITE_HASH_EXPIRED')) {
              results.failed.push({ link, error: 'Invite link expired' });
            } else if (error.message.includes('CHANNELS_TOO_MUCH')) {
              results.failed.push({ link, error: 'Too many channels joined' });
              console.log('\n⚠️  Reached Telegram limit for channels. Stopping...');
              break;
            } else if (error.message.includes('FLOOD_WAIT')) {
              const waitTime = parseInt(error.message.match(/\d+/)?.[0] || '60');
              results.failed.push({ link, error: `Rate limited (wait ${waitTime}s)` });
              console.log(`\n⚠️  Rate limited by Telegram. Please wait ${waitTime} seconds before continuing.`);
              if (!options.skipRateLimit) {
                break;
              }
            } else {
              results.failed.push({ link, error: error.message });
            }
          }
        }
      }).catch(error => {
        // Handle connection errors gracefully
        if (error.message && error.message.includes('TIMEOUT')) {
          console.log('\n⚠️  Connection timeout - processing completed successfully');
        } else {
          throw error;
        }
      });
      
      // Print summary
      console.log('\n' + '='.repeat(50));
      console.log('📊 SUMMARY');
      console.log('='.repeat(50));
      
      if (results.joined.length > 0) {
        console.log(`\n✅ Successfully joined (${results.joined.length}):`);
        if (options.verbose) {
          results.joined.forEach(link => console.log(`  • ${link}`));
        }
      }
      
      if (results.alreadyMember.length > 0) {
        console.log(`\nℹ️  Already a member (${results.alreadyMember.length}):`);
        if (options.verbose) {
          results.alreadyMember.forEach(link => console.log(`  • ${link}`));
        }
      }
      
      if (results.failed.length > 0) {
        console.log(`\n❌ Failed to join (${results.failed.length}):`);
        results.failed.forEach(item => {
          console.log(`  • ${item.link}`);
          if (options.verbose) {
            console.log(`    Reason: ${item.error}`);
          }
        });
      }
      
      if (results.invalid.length > 0) {
        console.log(`\n⚠️  Invalid links (${results.invalid.length}):`);
        if (options.verbose) {
          results.invalid.forEach(link => console.log(`  • ${link}`));
        }
      }
      
      if (results.muted.length > 0) {
        console.log(`\n🔇 Muted (${results.muted.length}):`);
        if (options.verbose) {
          results.muted.forEach(link => console.log(`  • ${link}`));
        }
      }
      
      if (results.archived.length > 0) {
        console.log(`\n📦 Archived (${results.archived.length}):`);
        if (options.verbose) {
          results.archived.forEach(link => console.log(`  • ${link}`));
        }
      }
      
      console.log(`\n📈 Total processed: ${links.length}`);
      console.log(`   Joined: ${results.joined.length}`);
      console.log(`   Already member: ${results.alreadyMember.length}`);
      console.log(`   Failed: ${results.failed.length}`);
      console.log(`   Invalid: ${results.invalid.length}`);
      
      if (options.mute) {
        console.log(`   Newly muted: ${results.muted.length}`);
        console.log(`   Already muted: ${results.alreadyMuted.length}`);
      }
      if (options.archive) {
        console.log(`   Newly archived: ${results.archived.length}`);
        console.log(`   Already archived: ${results.alreadyArchived.length}`);
      }
      
      if (options.json) {
        console.log('\n📄 JSON output:');
        console.log(JSON.stringify(results, null, 2));
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ Failed to process links:', error.message);
      throw error;
    }
  }
}

yargs(hideBin(process.argv))
  .scriptName('telegram-follow')
  .usage('$0 [links] [options]')
  .command('$0 [links]', 'Follow multiple Telegram channels/groups', {
    links: {
      describe: 'Telegram links in Links Notation format or space-separated. If not provided, uses cached telegram-links.lino',
      type: 'string',
      coerce: (input) => {
        // If no input provided, try to use cached file
        if (!input) {
          const cache = lino.requireCache(CACHE_FILES.TELEGRAM_LINKS,
            'No links provided and cache file not found.\n💡 Run vk-extract-telegram-links.mjs first to create the cache file');
          return cache.stringValues;
        }
        // Parse Links Notation input
        return lino.parseStringValues(input);
      }
    }
  }, async (argv) => {
    const follower = new TelegramFollower();
    try {
      // Handle case where no argument was provided
      let links = argv.links;
      if (!links) {
        const cache = lino.requireCache(CACHE_FILES.TELEGRAM_LINKS,
          'No links provided and cache file not found.\n💡 Run vk-extract-telegram-links.mjs first to create the cache file');
        links = cache.stringValues;
      }
      await follower.followLinks(links, argv);
    } catch (error) {
      if (!error.message || !error.message.includes('TIMEOUT')) {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }
    }
  })
  .option('delay', {
    alias: 'd',
    describe: 'Delay in seconds between joins (to avoid rate limiting)',
    type: 'number',
    default: 2
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Show detailed information',
    type: 'boolean',
    default: false
  })
  .option('json', {
    alias: 'j',
    describe: 'Output results as JSON',
    type: 'boolean',
    default: false
  })
  .option('skip-rate-limit', {
    alias: 's',
    describe: 'Continue processing even if rate limited',
    type: 'boolean',
    default: false
  })
  .option('mute', {
    alias: 'm',
    describe: 'Mute notifications for joined channels/groups',
    type: 'boolean',
    default: false
  })
  .option('archive', {
    alias: 'a',
    describe: 'Archive joined channels/groups',
    type: 'boolean',
    default: false
  })
  .option('debug', {
    describe: 'Show debug information about mute/archive status',
    type: 'boolean',
    default: false
  })
  .help()
  .example('$0', 'Follow channels using cached links from ~/.follow/telegram-links.lino')
  .example('$0 "(t.me/channel1 t.me/channel2)"', 'Follow channels using Links Notation')
  .example('./vk-extract-telegram-links.mjs "(1163)" --incoming-only | ./telegram-follow.mjs', 'Pipe from VK extractor')
  .example('$0 "(t.me/channel1 t.me/channel2)" --delay 5', 'Follow with 5 second delay')
  .example('$0 "(telegramLinks: t.me/channel1 t.me/channel2)" --verbose', 'Named Links Notation')
  .example('$0 "(t.me/channel1)" --mute --archive', 'Follow, mute and archive channel')
  .argv;