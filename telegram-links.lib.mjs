// Pure helpers for extracting Telegram links from free text (no network, no credentials).

export function extractTelegramLinks(text) {
  if (!text) return [];

  // Match various t.me link formats
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?t\.me\/\+[A-Za-z0-9_-]+/gi, // Private invite links (t.me/+hash)
    /(?:https?:\/\/)?(?:www\.)?t\.me\/joinchat\/[A-Za-z0-9_-]+/gi, // Legacy private invite links (t.me/joinchat/hash)
    /(?:https?:\/\/)?(?:www\.)?t\.me\/(?:c\/[\d]+\/[\d]+|(?!joinchat(?:\/|\b))[\w_]+)/gi, // Public channels and private channel message links
    /(?:https?:\/\/)?(?:www\.)?telegram\.me\/\+[A-Za-z0-9_-]+/gi, // Private invite links (telegram.me)
    /(?:https?:\/\/)?(?:www\.)?telegram\.me\/joinchat\/[A-Za-z0-9_-]+/gi, // Legacy private invite links (telegram.me)
    /(?:https?:\/\/)?(?:www\.)?telegram\.me\/(?!joinchat(?:\/|\b))[\w_]+/gi, // Public channels (telegram.me)
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
          .replace(/^https?:\/\//i, '')
          .replace(/^www\./i, '')
          .replace(/^telegram\.me\//i, 't.me/');
        links.add(normalized);
      }
    });
  });

  return Array.from(links);
}
