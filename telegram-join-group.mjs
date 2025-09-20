#!/usr/bin/env bun

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TelegramUserClient } from './telegram.lib.mjs';

class TelegramGroupJoiner {
  constructor() {
    this.client = new TelegramUserClient();
  }

  async joinGroup(link, options = {}) {
    try {
      await this.client.withConnection(async (client, Api) => {
        const parsed = this.client.parseInviteLink(link);
        if (!parsed) {
          console.error('❌ Invalid invite link format');
          console.log('💡 Expected formats:');
          console.log('   • https://t.me/joinchat/HASH');
          console.log('   • https://t.me/+HASH');
          console.log('   • https://t.me/username');
          return;
        }

        console.log(`🔗 Joining group from link: ${link}`);

        let result;
        if (parsed.type === 'private') {
          // Join via invite link
          console.log('📨 Using private invite link...');
          result = await this.client.importChatInvite(parsed.hash);
          console.log('✅ Successfully joined private group!');
        } else {
          // Join public channel/group
          console.log(`📢 Joining public group: @${parsed.username}`);
          
          // First, resolve the username to get the channel
          const resolvedPeer = await this.client.resolveUsername(parsed.username);

          if (!resolvedPeer.chats || resolvedPeer.chats.length === 0) {
            console.error('❌ Group not found');
            return;
          }

          const channel = resolvedPeer.chats[0];
          
          // Join the channel
          result = await this.client.joinChannel(channel);
          console.log(`✅ Successfully joined @${parsed.username}!`);
        }

        // Get group info if requested
        if (options.info) {
          await this.showGroupInfo(result);
        }

        // List recent messages if requested
        if (options.messages) {
          await this.showRecentMessages(result);
        }
      });
    } catch (error) {
      console.error('❌ Failed to join group:', error.message);
      
      if (error.message.includes('INVITE_HASH_EXPIRED')) {
        console.log('💡 The invite link has expired');
      } else if (error.message.includes('USER_ALREADY_PARTICIPANT')) {
        console.log('ℹ️  You are already a member of this group');
      } else if (error.message.includes('CHANNELS_TOO_MUCH')) {
        console.log('💡 You have joined too many channels/groups');
      }
    }
  }

  async listGroups(options = {}) {
    await this.client.withConnection(async () => {
      console.log('📋 Fetching your groups and channels...\n');

      const dialogs = await this.client.getDialogs();
      
      const groups = dialogs.filter(dialog => 
        dialog.isChannel || dialog.isGroup
      );

      if (groups.length === 0) {
        console.log('No groups or channels found');
        return;
      }

      console.log(`Found ${groups.length} group(s) and channel(s):\n`);

      const groupList = [];

      for (const dialog of groups) {
        const entity = dialog.entity;
        const groupInfo = {
          id: entity.id.toString(),
          title: entity.title || 'Unnamed',
          username: entity.username || null,
          type: dialog.isChannel ? (entity.megagroup ? 'Supergroup' : 'Channel') : 'Group',
          members: entity.participantsCount || 0,
          link: entity.username ? `https://t.me/${entity.username}` : null
        };

        groupList.push(groupInfo);

        if (options.verbose) {
          console.log(`📋 ${groupInfo.type}: ${groupInfo.title}`);
          console.log(`   ID: ${groupInfo.id}`);
          if (groupInfo.username) {
            console.log(`   Username: @${groupInfo.username}`);
          }
          if (groupInfo.link) {
            console.log(`   Link: ${groupInfo.link}`);
          }
          console.log(`   Members: ${groupInfo.members}`);
          console.log();
        } else {
          const username = groupInfo.username ? ` (@${groupInfo.username})` : '';
          console.log(`• [${groupInfo.type}] ${groupInfo.title}${username} - ${groupInfo.members} members`);
        }
      }

      if (options.json) {
        console.log('\nJSON output:');
        console.log(JSON.stringify(groupList, null, 2));
      }
    });
  }

  async leaveGroup(identifier, options = {}) {
    await this.client.withConnection(async (client, Api) => {
      console.log(`🚪 Leaving group: ${identifier}`);

      // Try to resolve the identifier (could be username, link, or ID)
      let entity;
      
      if (identifier.includes('t.me/')) {
        // It's a link
        const parsed = this.client.parseInviteLink(identifier);
        if (parsed && parsed.type === 'public') {
          entity = await this.client.getEntity(parsed.username);
        } else {
          console.error('❌ Cannot leave via private invite link');
          return;
        }
      } else if (identifier.startsWith('@')) {
        // It's a username
        entity = await this.client.getEntity(identifier);
      } else {
        // Try as username first, then as ID
        try {
          entity = await this.client.getEntity(identifier);
        } catch {
          entity = await this.client.getEntity(parseInt(identifier));
        }
      }

      if (entity.className === 'Channel' || entity.className === 'Chat') {
        await this.client.leaveChannel(entity);
        console.log(`✅ Successfully left group: ${entity.title || identifier}`);
      } else {
        console.error('❌ Not a valid group or channel');
      }
    });
  }
}

const argv = yargs(hideBin(process.argv))
  .scriptName('telegram-join-group')
  .usage('$0 <command> [options]')
  .command('join <link>', 'Join a Telegram group via invite link', {
    link: {
      describe: 'Telegram invite link',
      type: 'string'
    }
  }, async (argv) => {
    const joiner = new TelegramGroupJoiner();
    await joiner.joinGroup(argv.link, argv);
  })
  .command('list', 'List all your groups and channels', {}, async (argv) => {
    const joiner = new TelegramGroupJoiner();
    await joiner.listGroups(argv);
  })
  .command('leave <group>', 'Leave a group or channel', {
    group: {
      describe: 'Group username, link, or ID',
      type: 'string'
    }
  }, async (argv) => {
    const joiner = new TelegramGroupJoiner();
    await joiner.leaveGroup(argv.group, argv);
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
  .option('info', {
    alias: 'i',
    describe: 'Show group info after joining',
    type: 'boolean',
    default: false
  })
  .option('messages', {
    alias: 'm',
    describe: 'Show recent messages after joining',
    type: 'boolean',
    default: false
  })
  .demandCommand(1, 'Please specify a command')
  .help()
  .argv;