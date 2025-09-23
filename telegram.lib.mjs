import getenv from 'getenv';
import dotenvx from '@dotenvx/dotenvx';
import fs from 'fs';
import telegram from 'telegram';
import readlineSync from 'readline-sync';
import makeLog from 'log-lazy';

// Load .env at module level
dotenvx.config();

const { TelegramClient, Api } = telegram;
const { StringSession } = telegram.sessions;

export class TelegramUserClient {
  constructor(options = {}) {
    this.apiId = options.apiId || getenv('TELEGRAM_USER_BOT_API_ID', '');
    this.apiHash = options.apiHash || getenv('TELEGRAM_USER_BOT_API_HASH', '');
    this.phone = options.phone || getenv('TELEGRAM_USER_BOT_PHONE', '');
    this.session = options.session || getenv('TELEGRAM_USER_SESSION', '');
    
    this.log = makeLog({ level: options.logLevel || 'info' });
    this.client = null;
    this.Api = Api;
  }

  async saveSession() {
    try {
      const session = this.client.session.save();
      
      // Update internal session state
      this.session = session;
      
      // Ensure .env file exists
      const envPath = '.env';
      if (!fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, '');
        this.log.debug('Created empty .env file');
      }
      
      // Use dotenvx.set() to programmatically update the .env file
      dotenvx.set('TELEGRAM_USER_SESSION', session, { 
        path: envPath,
        encrypt: false  // Disable encryption for plain text storage
      });
      
      this.log.info('✅ Session saved to .env file');
    } catch (err) {
      this.log.error('❌ Error saving session:', err.message);
    }
  }

  async connect() {
    // Check if we have a session
    if (!this.session) {
      console.error('❌ TELEGRAM_USER_SESSION is not set in .env file');
      console.log('💡 To set up Telegram authentication:');
      console.log('   1. Set TELEGRAM_USER_BOT_API_ID and TELEGRAM_USER_BOT_API_HASH in .env');
      console.log('   2. Run the script again to authenticate and save the session');
      console.log('   Get your API credentials from https://my.telegram.org');
      
      // Check if we have API credentials for initial auth
      const apiId = this.apiId || readlineSync.question('Enter your Telegram API ID: ');
      const apiHash = this.apiHash || readlineSync.question('Enter your Telegram API Hash: ');
      
      if (!apiId || !apiHash) {
        throw new Error('API ID and API Hash are required for initial authentication');
      }
      
      const stringSession = new StringSession(this.session);
      this.client = new TelegramClient(
        stringSession, 
        parseInt(apiId, 10), 
        apiHash, 
        { connectionRetries: 5 }
      );
    } else {
      // We have a session - check if API credentials are available
      if (!this.apiId || !this.apiHash) {
        console.error('❌ TELEGRAM_USER_BOT_API_ID and TELEGRAM_USER_BOT_API_HASH are not set in .env file');
        console.log('💡 Even with an existing session, API credentials are required.');
        console.log('   Please set these environment variables in your .env file:');
        console.log('   TELEGRAM_USER_BOT_API_ID=your_api_id');
        console.log('   TELEGRAM_USER_BOT_API_HASH=your_api_hash');
        throw new Error('Missing required environment variables');
      }
      
      this.log.debug('✅ Using existing session from configuration');
      const stringSession = new StringSession(this.session);
      this.client = new TelegramClient(
        stringSession, 
        parseInt(this.apiId, 10), 
        this.apiHash, 
        { connectionRetries: 5 }
      );
    }

    const isNewSession = !this.session;

    await this.client.start({
      phoneNumber: async () => this.phone || readlineSync.question('Enter your phone number: '),
      password: async () => readlineSync.question('Enter your 2FA password (if any): ', { hideEchoBack: true }),
      phoneCode: async () => readlineSync.question('Enter the code you received: '),
      onError: err => this.log.error('❌ Error:', err.message),
    });

    this.log.info('✅ Connected to Telegram');

    if (isNewSession) {
      await this.saveSession();
    }

    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.log.debug('Disconnected from Telegram');
    }
  }

  async withConnection(fn) {
    try {
      await this.connect();
      return await fn(this.client, this.Api);
    } finally {
      await this.disconnect();
    }
  }

  async getMe() {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }
    return await this.client.getMe();
  }

  async getDialogs(options = {}) {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }
    return await this.client.getDialogs(options);
  }

  async getEntity(identifier) {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }
    return await this.client.getEntity(identifier);
  }

  async invoke(request) {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }
    return await this.client.invoke(request);
  }

  async sendMessage(entity, message) {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }
    return await this.client.sendMessage(entity, { message });
  }

  async joinChannel(channel) {
    return await this.invoke(
      new Api.channels.JoinChannel({ channel })
    );
  }

  async leaveChannel(channel) {
    return await this.invoke(
      new Api.channels.LeaveChannel({ channel })
    );
  }

  async importChatInvite(hash) {
    return await this.invoke(
      new Api.messages.ImportChatInvite({ hash })
    );
  }

  async resolveUsername(username) {
    return await this.invoke(
      new Api.contacts.ResolveUsername({ username })
    );
  }

  async updateNotificationSettings(peer, mute) {
    // Mute notifications for a peer (channel/chat)
    // Use MUTE_FOREVER for permanent mute (2147483647 seconds = ~68 years)
    const muteUntil = mute ? 2147483647 : 0;
    
    return await this.invoke(
      new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer }),
        settings: new Api.InputPeerNotifySettings({
          muteUntil,
          showPreviews: !mute,
          silent: mute
        })
      })
    );
  }

  async editFolder(peer, folderId) {
    // Move a chat to a folder (0 = main folder, 1 = archive)
    return await this.invoke(
      new Api.folders.EditPeerFolders({
        folderPeers: [
          new Api.InputFolderPeer({
            peer,
            folderId
          })
        ]
      })
    );
  }

  async getDialogByEntity(entity, cachedDialogs = null) {
    // Get dialog (conversation) info for a specific entity
    // Use cached dialogs if provided to avoid repeated API calls
    const dialogs = cachedDialogs || await this.getDialogs();
    for (const dialog of dialogs) {
      if (dialog.entity && entity.id) {
        if (dialog.entity.id.toString() === entity.id.toString()) {
          return dialog;
        }
      }
    }
    return null;
  }

  parseInviteLink(link) {
    // Handle private channel message links (t.me/c/CHANNEL_ID/MESSAGE_ID)
    const privateChannelPattern = /t\.me\/c\/(\d+)(?:\/\d+)?/;
    const privateChannelMatch = link.match(privateChannelPattern);
    if (privateChannelMatch) {
      return { type: 'private_channel', channelId: privateChannelMatch[1] };
    }

    const patterns = [
      /t\.me\/joinchat\/([A-Za-z0-9_-]+)/,
      /t\.me\/\+([A-Za-z0-9_-]+)/,
      /telegram\.me\/joinchat\/([A-Za-z0-9_-]+)/,
      /t\.me\/([A-Za-z0-9_]+)$/
    ];

    for (const pattern of patterns) {
      const match = link.match(pattern);
      if (match) {
        if (link.includes('joinchat') || link.includes('+')) {
          return { type: 'private', hash: match[1] };
        } else {
          return { type: 'public', username: match[1] };
        }
      }
    }

    return null;
  }
}

export default TelegramUserClient;