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
    const apiId = this.apiId || readlineSync.question('Enter your Telegram API ID: ');
    const apiHash = this.apiHash || readlineSync.question('Enter your Telegram API Hash: ');
    
    if (!apiId || !apiHash) {
      throw new Error('API ID and API Hash are required. Get them from https://my.telegram.org');
    }

    const stringSession = new StringSession(this.session);
    
    if (this.session) {
      this.log.debug('✅ Using existing session from configuration');
    }
    
    this.client = new TelegramClient(
      stringSession, 
      parseInt(apiId, 10), 
      apiHash, 
      { connectionRetries: 5 }
    );

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

  parseInviteLink(link) {
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