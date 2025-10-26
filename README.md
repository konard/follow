# follow
A tool to follow telegram channels and manage VK/Telegram groups

## Overview
This repository contains command-line tools for managing and interacting with VK group chats and Telegram groups/channels.

## Prerequisites

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies with Bun
bun install
```

## VK Group Chats Command

### Setup
1. Get VK access token from https://vk.com/dev
2. Create `.env` file:
```env
VK_ACCESS_TOKEN=your_vk_access_token_here
LOG_LEVEL=info
```

### Usage

```bash
# List all group chats
bun run vk-list-chats.mjs

# List with detailed information
bun run vk-list-chats.mjs --verbose

# Output as JSON
bun run vk-list-chats.mjs --json

# Get details for specific chat
bun run vk-list-chats.mjs details 123

# Pagination
bun run vk-list-chats.mjs --limit 50 --offset 0
```

### Features
- Lists all VK group chats you're part of
- Shows chat ID, title, member count
- Detailed view with last messages
- JSON output for automation
- Chat details with member list

## Telegram Group Join Command

### Setup
1. Get API credentials from https://my.telegram.org
2. Create `.env` file:
```env
TELEGRAM_USER_BOT_API_ID=your_api_id
TELEGRAM_USER_BOT_API_HASH=your_api_hash
TELEGRAM_USER_BOT_PHONE=+1234567890
TELEGRAM_USER_SESSION=  # Will be auto-populated after first login
LOG_LEVEL=info
```

### Usage

```bash
# Join group via invite link
bun run telegram-join-group.mjs join https://t.me/joinchat/XXXXXXXXXXXX
bun run telegram-join-group.mjs join https://t.me/+XXXXXXXXXXXX
bun run telegram-join-group.mjs join https://t.me/groupusername

# List all your groups
bun run telegram-join-group.mjs list
bun run telegram-join-group.mjs list --verbose
bun run telegram-join-group.mjs list --json

# Leave a group
bun run telegram-join-group.mjs leave @groupusername
bun run telegram-join-group.mjs leave https://t.me/groupusername
bun run telegram-join-group.mjs leave 123456789

# Join with additional options
bun run telegram-join-group.mjs join https://t.me/groupname --info --messages
```

### Features
- Join groups via invite links (private and public)
- Session persistence (saves to `TELEGRAM_USER_SESSION` in `.env`)
- Automatic session migration from old `.telegram_session` files
- List all your groups and channels
- Leave groups by username, link, or ID
- Supports 2FA authentication
- Detailed group information
- JSON output for automation

## Session Management

### VK
- Uses access token authentication
- Token stored in environment variable or `.env` file
- No session file needed

### Telegram
- Uses MTProto with session persistence
- Session saved to `TELEGRAM_USER_SESSION` in `.env` file
- Automatic migration from old `.telegram_session` file to `.env`
- First run requires phone verification
- Subsequent runs use saved session from `.env`
- Supports 2FA passwords
- Uses @dotenvx/dotenvx for secure .env management

## Security Notes
- Never commit `.env` files
- Add them to `.gitignore`:
```gitignore
.env
.env.*
```
- Keep your API credentials secure
- Use environment variables in production

## Error Handling
Both commands include comprehensive error handling:
- Invalid credentials detection
- Expired invite links
- Rate limiting
- Network errors
- Permission errors

## Standard Command Sequence

Follow this sequence for the complete workflow:

```bash
# 1. List VK chats to see what's available
./vk-list-chats.mjs --filter-telegram-chats

# 2. Extract Telegram links from VK chats (only incoming messages)
./vk-extract-telegram-links.mjs --incoming-only

# 3. Follow the extracted Telegram channels/groups (with mute and archive)
./telegram-follow.mjs --mute --archive

# 4. Send Telegram link back to VK chats
./vk-send-telegram-link-to-chats.mjs --delete-all-incoming-messages-in-chat-on-success
```

Or use the automated workflow:

```bash
# Run the complete auto-follow sequence
./auto-follow.mjs

# With verbose output
./auto-follow.mjs --verbose
```

The `auto-follow.mjs` script automatically:
1. Lists VK chats with Telegram in the name
2. Extracts Telegram links from those chats (including private invite links)
3. Follows the extracted channels/groups
4. Sends your Telegram link to VK chats
5. Retries rejected chats with fresh link extraction until success or max iterations

## Example Workflow

```bash
# VK: List and analyze group chats
bun run vk-list-chats.mjs --json > vk-groups.json

# Telegram: Join multiple groups
bun run telegram-join-group.mjs join https://t.me/group1
bun run telegram-join-group.mjs join https://t.me/group2

# List all groups
bun run telegram-join-group.mjs list --verbose

# Or use npm-style scripts
bun run vk-list --json > vk-groups.json
bun run telegram-join join https://t.me/group1
```
