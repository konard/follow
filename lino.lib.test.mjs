import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LinksNotationManager, lino } from './lino.lib.mjs';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('LinksNotationManager', () => {
  let manager;
  let testStorageDir;

  beforeEach(() => {
    manager = new LinksNotationManager();
    // Use a temporary test directory
    testStorageDir = path.join(os.tmpdir(), 'lino-test-' + Date.now());
    manager.storageDir = testStorageDir;
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });

  describe('parse', () => {
    test('should parse empty input', () => {
      expect(manager.parse('')).toEqual([]);
      expect(manager.parse(null)).toEqual([]);
      expect(manager.parse(undefined)).toEqual([]);
    });

    test('should parse simple Links Notation', () => {
      const result = manager.parse('(a b c)');
      expect(result).toBeArrayOfSize(3);
    });

    test('should parse single value', () => {
      const result = manager.parse('(value)');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('parseNumericIds', () => {
    test('should parse numeric IDs from Links Notation', () => {
      const result = manager.parseNumericIds('(123 456 789)');
      expect(result).toEqual([123, 456, 789]);
    });

    test('should handle empty input', () => {
      expect(manager.parseNumericIds('')).toEqual([]);
      expect(manager.parseNumericIds(null)).toEqual([]);
    });

    test('should filter out non-numeric values', () => {
      const result = manager.parseNumericIds('(123 abc 456)');
      expect(result).toContain(123);
      expect(result).toContain(456);
    });
  });

  describe('parseStringValues', () => {
    test('should parse string values from Links Notation', () => {
      const result = manager.parseStringValues('(hello world test)');
      expect(result).toContain('hello');
      expect(result).toContain('world');
      expect(result).toContain('test');
    });

    test('should handle empty input', () => {
      expect(manager.parseStringValues('')).toEqual([]);
      expect(manager.parseStringValues(null)).toEqual([]);
    });
  });

  describe('format', () => {
    test('should format empty array', () => {
      expect(manager.format([])).toBe('()');
      expect(manager.format(null)).toBe('()');
    });

    test('should format array with values', () => {
      const result = manager.format(['a', 'b', 'c']);
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).toContain('c');
      expect(result).toStartWith('(');
      expect(result).toEndWith(')');
    });

    test('should format with proper indentation', () => {
      const result = manager.format([1, 2, 3]);
      expect(result).toMatch(/\(\n  1\n  2\n  3\n\)/);
    });
  });

  describe('escapeReference', () => {
    test('should not escape numbers', () => {
      expect(manager.escapeReference(123)).toBe('123');
      expect(manager.escapeReference(45.67)).toBe('45.67');
    });

    test('should not escape booleans', () => {
      expect(manager.escapeReference(true)).toBe('true');
      expect(manager.escapeReference(false)).toBe('false');
    });

    test('should not escape simple strings', () => {
      expect(manager.escapeReference('hello')).toBe('hello');
      expect(manager.escapeReference('test123')).toBe('test123');
    });

    test('should escape strings with spaces using single quotes', () => {
      expect(manager.escapeReference('hello world')).toBe("'hello world'");
    });

    test('should escape strings with single quotes using double quotes', () => {
      expect(manager.escapeReference("it's")).toBe('"it\'s"');
    });

    test('should escape strings with double quotes using single quotes', () => {
      expect(manager.escapeReference('say "hello"')).toBe('\'say "hello"\'');
    });

    test('should minimize escaping when both quotes present', () => {
      // More single quotes -> use double quotes
      const result1 = manager.escapeReference("it's a 'test' string");
      expect(result1).toStartWith('"');

      // More double quotes -> use single quotes
      const result2 = manager.escapeReference('say "hello" and "world"');
      expect(result2).toStartWith("'");
    });

    test('should escape strings with parentheses', () => {
      expect(manager.escapeReference('(test)')).toBe("'(test)'");
    });
  });

  describe('jsonToLino', () => {
    test('should convert null', () => {
      expect(manager.jsonToLino(null)).toBe('null');
      expect(manager.jsonToLino(undefined)).toBe('null');
    });

    test('should convert numbers', () => {
      expect(manager.jsonToLino(123)).toBe('123');
      expect(manager.jsonToLino(45.67)).toBe('45.67');
    });

    test('should convert booleans', () => {
      expect(manager.jsonToLino(true)).toBe('true');
      expect(manager.jsonToLino(false)).toBe('false');
    });

    test('should convert simple strings', () => {
      expect(manager.jsonToLino('hello')).toBe('hello');
    });

    test('should convert strings with spaces', () => {
      expect(manager.jsonToLino('hello world')).toBe("'hello world'");
    });

    test('should convert empty array', () => {
      expect(manager.jsonToLino([])).toBe('()');
    });

    test('should convert array with primitives', () => {
      const result = manager.jsonToLino([1, 2, 3]);
      expect(result).toBe('(1 2 3)');
    });

    test('should convert array with strings', () => {
      const result = manager.jsonToLino(['a', 'b', 'c']);
      expect(result).toBe('(a b c)');
    });

    test('should convert empty object', () => {
      expect(manager.jsonToLino({})).toBe('()');
    });

    test('should convert simple object', () => {
      const result = manager.jsonToLino({ name: 'John', age: 30 });
      expect(result).toContain('name');
      expect(result).toContain('John');
      expect(result).toContain('age');
      expect(result).toContain('30');
    });

    test('should convert object with string value containing spaces', () => {
      const result = manager.jsonToLino({ name: 'John Doe' });
      expect(result).toContain("'John Doe'");
    });

    test('should convert nested objects', () => {
      const result = manager.jsonToLino({
        user: { name: 'Alice', age: 25 }
      });
      expect(result).toContain('user');
      expect(result).toContain('name');
      expect(result).toContain('Alice');
    });

    test('should convert nested arrays', () => {
      const result = manager.jsonToLino([[1, 2], [3, 4]]);
      expect(result).toBe('((1 2) (3 4))');
    });

    test('should convert complex nested structure', () => {
      const result = manager.jsonToLino({
        users: [
          { name: 'Alice', age: 25 },
          { name: 'Bob', age: 30 }
        ]
      });
      expect(result).toContain('users');
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
    });

    test('should convert object with boolean values', () => {
      const result = manager.jsonToLino({ active: true, deleted: false });
      expect(result).toContain('true');
      expect(result).toContain('false');
    });
  });

  describe('linoToJson', () => {
    test('should convert null', () => {
      expect(manager.linoToJson('null')).toBe(null);
    });

    test('should handle empty or invalid input', () => {
      expect(manager.linoToJson('')).toBe(null);
      expect(manager.linoToJson(null)).toBe(null);
    });

    test('should convert numbers', () => {
      expect(manager.linoToJson('123')).toBe(123);
      expect(manager.linoToJson('45.67')).toBe(45.67);
    });

    test('should convert booleans', () => {
      expect(manager.linoToJson('true')).toBe(true);
      expect(manager.linoToJson('false')).toBe(false);
    });

    test('should convert strings', () => {
      expect(manager.linoToJson('hello')).toBe('hello');
    });

    test('should convert empty link to array', () => {
      expect(manager.linoToJson('()')).toEqual([]);
    });

    test('should convert link with primitives to array', () => {
      expect(manager.linoToJson('(1 2 3)')).toEqual([1, 2, 3]);
    });

    test('should convert wrapped pairs to object', () => {
      const result = manager.linoToJson('((name John) (age 30))');
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    test('should convert nested structures', () => {
      const result = manager.linoToJson('((1 2) (3 4))');
      expect(result).toEqual([[1, 2], [3, 4]]);
    });

    test('should handle odd number of elements as array', () => {
      const result = manager.linoToJson('(1 2 3)');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('jsonToLino and linoToJson round-trip', () => {
    // Objects are represented as wrapped pairs: ((key1 val1) (key2 val2))
    // Arrays are represented as plain links: (item1 item2 item3)
    // This makes the distinction unambiguous

    test('should round-trip simple object', () => {
      const original = { name: 'John', age: 30, active: true };
      const lino = manager.jsonToLino(original);
      const result = manager.linoToJson(lino);
      expect(result).toEqual(original);
    });

    test('should round-trip nested object', () => {
      const original = {
        user: { name: 'Alice', age: 25 },
        settings: { theme: 'dark', notifications: true }
      };
      const lino = manager.jsonToLino(original);
      const result = manager.linoToJson(lino);
      expect(result).toEqual(original);
    });

    test('should round-trip array', () => {
      const original = [1, 2, 3, 4, 5];
      const lino = manager.jsonToLino(original);
      const result = manager.linoToJson(lino);
      expect(result).toEqual(original);
    });

    test('should round-trip complex structure', () => {
      const original = {
        totalSent: 4,
        survived: 4,
        deleted: 0,
        skipped: 0,
        deletedForRetry: 0,
        needsRetry: false
      };
      const lino = manager.jsonToLino(original);
      const result = manager.linoToJson(lino);
      expect(result).toEqual(original);
    });
  });

  describe('ensureDir', () => {
    test('should create storage directory if not exists', () => {
      expect(fs.existsSync(testStorageDir)).toBe(false);
      const created = manager.ensureDir();
      expect(fs.existsSync(testStorageDir)).toBe(true);
      expect(created).toBe(true);
    });

    test('should return false if directory already exists', () => {
      manager.ensureDir();
      const created = manager.ensureDir();
      expect(created).toBe(false);
    });
  });

  describe('saveAsLino and loadFromLino', () => {
    test('should save and load array values', () => {
      const values = [1, 2, 3, 4, 5];
      manager.saveAsLino('test.lino', values);

      const loaded = manager.loadFromLino('test.lino');
      expect(loaded.numericIds).toEqual(values);
    });

    test('should return null for non-existent file', () => {
      const loaded = manager.loadFromLino('nonexistent.lino');
      expect(loaded).toBe(null);
    });

    test('should save string values', () => {
      const values = ['a', 'b', 'c'];
      manager.saveAsLino('strings.lino', values);

      const loaded = manager.loadFromLino('strings.lino');
      expect(loaded.stringValues).toContain('a');
      expect(loaded.stringValues).toContain('b');
      expect(loaded.stringValues).toContain('c');
    });
  });

  describe('saveJsonAsLino and loadJsonFromLino', () => {
    test('should save and load structured data', () => {
      const data = {
        totalSent: 4,
        survived: 4,
        deleted: 0,
        needsRetry: false
      };

      manager.saveJsonAsLino('results.lino', data);
      const loaded = manager.loadJsonFromLino('results.lino');

      expect(loaded).toEqual(data);
    });

    test('should return null for non-existent file', () => {
      const loaded = manager.loadJsonFromLino('nonexistent.lino');
      expect(loaded).toBe(null);
    });

    test('should handle complex nested data', () => {
      const data = {
        user: { name: 'Alice', age: 25 },
        active: true,
        tags: ['admin', 'user']
      };

      manager.saveJsonAsLino('complex.lino', data);
      const loaded = manager.loadJsonFromLino('complex.lino');

      expect(loaded).toEqual(data);
    });
  });

  describe('fileExists', () => {
    test('should return false for non-existent file', () => {
      expect(manager.fileExists('nonexistent.lino')).toBe(false);
    });

    test('should return true for existing file', () => {
      manager.saveAsLino('test.lino', [1, 2, 3]);
      expect(manager.fileExists('test.lino')).toBe(true);
    });
  });

  describe('getFilePath', () => {
    test('should return full path to file', () => {
      const filePath = manager.getFilePath('test.lino');
      expect(filePath).toBe(path.join(testStorageDir, 'test.lino'));
    });
  });

  describe('requireFile', () => {
    test('should load file if exists', () => {
      // Suppress console output during test
      const originalConsoleLog = console.log;
      console.log = () => {};

      manager.saveAsLino('test.lino', [1, 2, 3]);
      const data = manager.requireFile('test.lino', 'Error message');
      expect(data).not.toBe(null);
      expect(data.numericIds).toEqual([1, 2, 3]);

      // Restore console
      console.log = originalConsoleLog;
    });

    test('should exit with error if file does not exist', () => {
      // Mock process.exit and console.error to prevent actual exit and suppress output
      const originalExit = process.exit;
      const originalConsoleError = console.error;
      const originalConsoleLog = console.log;

      let exitCode;
      process.exit = (code) => { exitCode = code; throw new Error('Exit'); };
      console.error = () => {}; // Suppress error output
      console.log = () => {}; // Suppress log output

      try {
        manager.requireFile('nonexistent.lino', 'Custom error');
      } catch (e) {
        // Expected to throw
      }

      expect(exitCode).toBe(1);

      // Restore original functions
      process.exit = originalExit;
      console.error = originalConsoleError;
      console.log = originalConsoleLog;
    });
  });
});

describe('lino singleton', () => {
  test('should be an instance of LinksNotationManager', () => {
    expect(lino).toBeInstanceOf(LinksNotationManager);
  });

  test('should have storageDir in user home', () => {
    expect(lino.storageDir).toBe(path.join(os.homedir(), '.follow'));
  });
});
