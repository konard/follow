import { Parser as LinoParser } from '@linksplatform/protocols-lino';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class LinksNotationManager {
  constructor() {
    this.parser = new LinoParser();
    this.cacheDir = path.join(os.homedir(), '.follow');
  }

  /**
   * Parse Links Notation input into an array of values
   */
  parse(input) {
    if (!input) return [];
    
    const parsed = this.parser.parse(input);
    
    if (parsed && parsed.length > 0) {
      const link = parsed[0];
      const values = [];
      
      // If link has values, extract them
      if (link.values && link.values.length > 0) {
        for (const value of link.values) {
          const val = value.id || value;
          values.push(val);
        }
      } else if (link.id) {
        // Try to extract from the link id itself
        values.push(link.id);
      }
      
      return values;
    }
    
    return [];
  }

  /**
   * Parse Links Notation input specifically for numeric IDs (e.g., chat IDs)
   */
  parseNumericIds(input) {
    if (!input) return [];
    
    const parsed = this.parser.parse(input);
    
    if (parsed && parsed.length > 0) {
      const link = parsed[0];
      const ids = [];
      
      // If link has values, extract them
      if (link.values && link.values.length > 0) {
        for (const value of link.values) {
          const num = parseInt(value.id || value);
          if (!isNaN(num)) {
            ids.push(num);
          }
        }
      } else if (link.id) {
        // Try to extract from the link id itself
        const nums = link.id.match(/\d+/g);
        if (nums) {
          ids.push(...nums.map(n => parseInt(n)).filter(n => !isNaN(n)));
        }
      }
      
      return ids;
    }
    
    return [];
  }

  /**
   * Parse Links Notation input for string values (e.g., Telegram links)
   */
  parseStringValues(input) {
    if (!input) return [];
    
    const parsed = this.parser.parse(input);
    
    if (parsed && parsed.length > 0) {
      const link = parsed[0];
      const links = [];
      
      // If link has values, extract them
      if (link.values && link.values.length > 0) {
        for (const value of link.values) {
          const linkStr = value.id || value;
          if (typeof linkStr === 'string') {
            links.push(linkStr);
          }
        }
      } else if (link.id) {
        // If the link has an id, use it as is
        if (typeof link.id === 'string') {
          links.push(link.id);
        }
      }
      
      return links;
    }
    
    return [];
  }

  /**
   * Format an array as Links Notation with proper indentation
   */
  format(values) {
    if (!values || values.length === 0) return '()';
    
    const formattedValues = values.map(value => `  ${value}`).join('\n');
    return `(\n${formattedValues}\n)`;
  }

  /**
   * Ensure cache directory exists
   */
  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      return true; // Created new directory
    }
    return false; // Directory already existed
  }

  /**
   * Save values to a cache file in Links Notation format
   */
  saveToCache(filename, values) {
    this.ensureCacheDir();
    const cacheFile = path.join(this.cacheDir, filename);
    const linksNotation = this.format(values);
    fs.writeFileSync(cacheFile, linksNotation);
    return cacheFile;
  }

  /**
   * Load and parse a cache file
   */
  loadFromCache(filename) {
    const cacheFile = path.join(this.cacheDir, filename);
    
    if (!fs.existsSync(cacheFile)) {
      return null;
    }
    
    const content = fs.readFileSync(cacheFile, 'utf8');
    return {
      raw: content,
      parsed: this.parse(content),
      numericIds: this.parseNumericIds(content),
      stringValues: this.parseStringValues(content),
      file: cacheFile
    };
  }

  /**
   * Check if a cache file exists
   */
  cacheExists(filename) {
    const cacheFile = path.join(this.cacheDir, filename);
    return fs.existsSync(cacheFile);
  }

  /**
   * Get full path to cache file
   */
  getCachePath(filename) {
    return path.join(this.cacheDir, filename);
  }

  /**
   * Load cache or exit with error message
   */
  requireCache(filename, errorMessage) {
    const cache = this.loadFromCache(filename);
    
    if (!cache) {
      const cacheFile = this.getCachePath(filename);
      console.error(`❌ ${errorMessage || `Cache file not found: ${cacheFile}`}`);
      console.log(`💡 Run the appropriate script first to create the cache file`);
      process.exit(1);
    }
    
    console.log(`📂 Using cached data from: ${cache.file}\n`);
    return cache;
  }
}

// Default cache filenames
export const CACHE_FILES = {
  VK_CHATS: 'vk-chats.lino',
  TELEGRAM_LINKS: 'telegram-links.lino'
};

// Singleton instance for convenience
export const lino = new LinksNotationManager();