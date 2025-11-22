import { Parser as LinoParser } from '@linksplatform/protocols-lino';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class LinksNotationManager {
  constructor() {
    this.parser = new LinoParser();
    this.storageDir = path.join(os.homedir(), '.follow');
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
   * Ensure storage directory exists
   */
  ensureDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
      return true; // Created new directory
    }
    return false; // Directory already existed
  }

  /**
   * Save array values to a file in Links Notation format
   */
  saveAsLino(filename, values) {
    this.ensureDir();
    const filePath = path.join(this.storageDir, filename);
    const linksNotation = this.format(values);
    fs.writeFileSync(filePath, linksNotation);
    return filePath;
  }

  /**
   * Escape a reference for Links Notation
   *
   * In Links Notation, we have only references and links:
   * - Reference: An identifier or value (string, number, boolean)
   * - Link: A parenthesized sequence of references or nested links
   *
   * References need escaping when they contain spaces or quotes:
   * - Use single quotes '' if the string contains spaces or double quotes
   * - Use double quotes "" if the string contains single quotes
   * - Use double quotes "" if it contains both (escape internal double quotes)
   *
   * @param {*} value - The value to escape
   * @returns {string} - The escaped reference
   */
  escapeReference(value) {
    // Numbers and booleans don't need escaping
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    const str = String(value);

    // Check if escaping is needed (contains spaces, quotes, parentheses, or newlines)
    const needsEscaping = /[\s()'"]/.test(str);

    if (!needsEscaping) {
      return str;
    }

    // If contains single quotes but not double quotes, use double quotes
    if (str.includes("'") && !str.includes('"')) {
      return `"${str}"`;
    }

    // If contains double quotes but not single quotes, use single quotes
    if (str.includes('"') && !str.includes("'")) {
      return `'${str}'`;
    }

    // If contains both quotes, count which one appears more
    // and use the other one to minimize escaping
    if (str.includes("'") && str.includes('"')) {
      const singleQuoteCount = (str.match(/'/g) || []).length;
      const doubleQuoteCount = (str.match(/"/g) || []).length;

      if (doubleQuoteCount < singleQuoteCount) {
        // Use double quotes, escape internal double quotes by doubling
        return `"${str.replace(/"/g, '""')}"`;
      } else {
        // Use single quotes, escape internal single quotes by doubling
        return `'${str.replace(/'/g, "''")}'`;
      }
    }

    // Just spaces or other special characters, use single quotes by default
    return `'${str}'`;
  }

  /**
   * Convert JSON data to Links Notation recursively
   *
   * Conversion rules:
   * - Primitives (number, boolean, string, null): Converted to references
   * - Array: Converted to a link (parenthesized sequence)
   * - Object: Converted to a link with key-value doublet pairs
   *   Each key-value pair becomes two consecutive references
   *
   * Example:
   *   { name: "John Doe", age: 30, active: true }
   * Becomes:
   *   (name 'John Doe' age 30 active true)
   *
   * Example with nested structure:
   *   { users: [{ name: "Alice", age: 25 }, { name: "Bob", age: 30 }] }
   * Becomes:
   *   (users ((name Alice age 25) (name Bob age 30)))
   *
   * @param {*} json - The JSON data to convert
   * @returns {string} - Links Notation representation
   */
  jsonToLino(json) {
    // Handle null and undefined
    if (json === null || json === undefined) {
      return 'null';
    }

    // Handle primitives
    if (typeof json === 'number' || typeof json === 'boolean') {
      return String(json);
    }

    if (typeof json === 'string') {
      return this.escapeReference(json);
    }

    // Handle arrays - convert to link
    if (Array.isArray(json)) {
      if (json.length === 0) {
        return '()';
      }
      const elements = json.map(item => this.jsonToLino(item));
      return `(${elements.join(' ')})`;
    }

    // Handle objects - convert to key-value doublet pairs
    // Objects are ALWAYS represented as a link of pairs: ((key1 value1) (key2 value2) ...)
    // This makes the structure unambiguous
    if (typeof json === 'object') {
      const entries = Object.entries(json);
      if (entries.length === 0) {
        return '()';
      }

      // Wrap each key-value pair in its own link
      // ((key1 value1) (key2 value2) ...)
      const pairs = entries.map(([key, value]) => {
        const escapedKey = this.escapeReference(key);
        const convertedValue = this.jsonToLino(value);
        return `(${escapedKey} ${convertedValue})`;
      });

      return `(${pairs.join(' ')})`;
    }

    // Fallback for unknown types
    return this.escapeReference(String(json));
  }

  /**
   * Convert Links Notation to JSON recursively
   *
   * Conversion rules:
   * - References are converted to primitives (try number, boolean, then string)
   * - Links are analyzed:
   *   - If all elements are primitives and count is even, try to parse as object (key-value pairs)
   *   - Otherwise, parse as array
   *
   * @param {string} lino - The Links Notation string
   * @returns {*} - JSON representation
   */
  linoToJson(lino) {
    if (!lino || typeof lino !== 'string') {
      return null;
    }

    const parsed = this.parser.parse(lino);

    if (!parsed || parsed.length === 0) {
      return null;
    }

    const result = this._convertParsedToJson(parsed[0]);

    // If the parser wrapped a single primitive in an array, unwrap it
    if (Array.isArray(result) && result.length === 1 &&
        (typeof result[0] === 'string' || typeof result[0] === 'number' ||
         typeof result[0] === 'boolean' || result[0] === null)) {
      return result[0];
    }

    return result;
  }

  /**
   * Internal helper to convert parsed Links Notation to JSON
   * @private
   */
  _convertParsedToJson(element) {
    // If element is a simple value (reference)
    if (typeof element === 'string' || typeof element === 'number') {
      return this._parseReference(element);
    }

    // If element has an id and empty values array, it's a reference/primitive or empty link
    if (element.values && element.values.length === 0) {
      // If id is null, it's an empty link ()
      if (element.id === null) {
        return [];
      }
      // Otherwise it's a primitive reference
      return this._parseReference(element.id);
    }

    // If element is a link (has non-empty values)
    if (element.values && Array.isArray(element.values) && element.values.length > 0) {
      // Simple rule: If link contains pairs (all children are 2-element links), it's an object
      // Otherwise, it's an array

      const allPairs = element.values.every(child => {
        // Must be a link with exactly 2 elements
        if (!child.values || !Array.isArray(child.values) || child.values.length !== 2) {
          return false;
        }
        // First element (key) must be a primitive
        const keyElement = child.values[0];
        if (!(keyElement.id !== undefined && keyElement.values && keyElement.values.length === 0)) {
          return false;
        }
        // Key should be string-like (not a pure number)
        const keyValue = this._parseReference(keyElement.id);
        if (typeof keyValue === 'number') {
          return false;
        }
        return true;
      });

      if (allPairs) {
        // This is an object: ((key1 value1) (key2 value2) ...)
        const obj = {};
        for (const child of element.values) {
          const key = this._parseReference(child.values[0].id);
          const value = this._convertParsedToJson(child.values[1]);
          obj[key] = value;
        }
        return obj;
      }

      // Not pairs, so it's an array
      return element.values.map(v => this._convertParsedToJson(v));
    }

    return null;
  }

  /**
   * Parse a reference to its primitive value
   * @private
   */
  _parseReference(ref) {
    const str = String(ref);

    // Try boolean
    if (str === 'true') return true;
    if (str === 'false') return false;

    // Try null
    if (str === 'null') return null;

    // Try number
    const num = Number(str);
    if (!isNaN(num) && str.trim() !== '') {
      return num;
    }

    // Return as string
    return str;
  }

  /**
   * Save structured data (JSON) to a file in Links Notation format
   * Converts JSON data to Links Notation recursively
   */
  saveJsonAsLino(filename, data) {
    this.ensureDir();
    const filePath = path.join(this.storageDir, filename);
    const linksNotation = this.jsonToLino(data);
    fs.writeFileSync(filePath, linksNotation);
    return filePath;
  }

  /**
   * Load structured data from a Links Notation file and convert to JSON
   * Converts Links Notation to JSON recursively
   */
  loadJsonFromLino(filename) {
    const filePath = path.join(this.storageDir, filename);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return this.linoToJson(content);
  }

  /**
   * Load and parse a Links Notation file
   */
  loadFromLino(filename) {
    const filePath = path.join(this.storageDir, filename);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return {
      raw: content,
      parsed: this.parse(content),
      numericIds: this.parseNumericIds(content),
      stringValues: this.parseStringValues(content),
      file: filePath
    };
  }

  /**
   * Check if a file exists
   */
  fileExists(filename) {
    const filePath = path.join(this.storageDir, filename);
    return fs.existsSync(filePath);
  }

  /**
   * Get full path to file
   */
  getFilePath(filename) {
    return path.join(this.storageDir, filename);
  }

  /**
   * Load file or exit with error message
   * (Application-specific helper for scripts that depend on previous outputs)
   */
  requireFile(filename, errorMessage) {
    const data = this.loadFromLino(filename);

    if (!data) {
      const filePath = this.getFilePath(filename);
      console.error(`❌ ${errorMessage || `File not found: ${filePath}`}`);
      console.log(`💡 Run the appropriate script first to create the file`);
      process.exit(1);
    }

    console.log(`📂 Using data from: ${data.file}\n`);
    return data;
  }
}

// Singleton instance for convenience
export const lino = new LinksNotationManager();