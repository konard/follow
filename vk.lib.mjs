import getenv from 'getenv';
import dotenvx from '@dotenvx/dotenvx';
import { VK } from 'vk-io';
import makeLog from 'log-lazy';

dotenvx.config({ quiet: true });

export class VKClient {
  constructor(options = {}) {
    this.accessToken = options.accessToken || getenv('VK_ACCESS_TOKEN', '');
    this.log = makeLog({ level: options.logLevel || 'info' });
    this.vk = null;

    if (!this.accessToken) {
      throw new Error('VK_ACCESS_TOKEN is required. Set it in .env file or pass as option.');
    }

    // Configure timeout and retry settings
    // Default apiTimeout is 10000ms (10s) which is too short for some requests
    // Increase to 30000ms (30s) by default, but allow configuration via env or options
    const apiTimeout = options.apiTimeout ||
                      parseInt(getenv('VK_API_TIMEOUT', '30000'), 10);
    const apiRetryLimit = options.apiRetryLimit ||
                         parseInt(getenv('VK_API_RETRY_LIMIT', '3'), 10);

    this.vk = new VK({
      token: this.accessToken,
      apiTimeout,
      apiRetryLimit
    });

    this.log.info(`VK Client configured with timeout: ${apiTimeout}ms, retries: ${apiRetryLimit}`);
  }


  async testConnection() {
    try {
      const user = await this.vk.api.users.get({});
      this.log.info(`✅ Connected to VK as ${user[0].first_name} ${user[0].last_name}`);
      return true;
    } catch (error) {
      this.log.error('❌ Failed to connect to VK:', error.message);
      return false;
    }
  }

  async getConversations(options = {}) {
    return await this.vk.api.messages.getConversations({
      count: options.count || 200,
      offset: options.offset || 0,
      extended: 1,
      fields: options.fields || 'photo_100,members_count'
    });
  }

  async getConversationById(peerId) {
    return await this.vk.api.messages.getConversationsById({
      peer_ids: peerId,
      extended: 1,
      fields: 'photo_100,screen_name'
    });
  }

  async getConversationMembers(peerId, fields) {
    return await this.vk.api.messages.getConversationMembers({
      peer_id: peerId,
      fields: fields || 'first_name,last_name,screen_name'
    });
  }

  async sendMessage(peerId, message) {
    return await this.vk.api.messages.send({
      peer_id: peerId,
      message: message,
      random_id: Date.now()
    });
  }

  async deleteMessage(messageId) {
    return await this.vk.api.messages.delete({
      message_ids: messageId,
      delete_for_all: 1
    });
  }

  async wallPost(ownerId, message) {
    return await this.vk.api.wall.post({
      owner_id: ownerId,
      message: message
    });
  }

  async wallDelete(ownerId, postId) {
    return await this.vk.api.wall.delete({
      owner_id: ownerId,
      post_id: postId
    });
  }

  getApi() {
    return this.vk.api;
  }
}

export default VKClient;