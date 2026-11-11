import { test, expect } from 'bun:test';
import { extractTelegramLinks } from './telegram-links.lib.mjs';

test('keeps legacy joinchat invite hash (issue #17)', () => {
  expect(extractTelegramLinks('https://t.me/joinchat/AbC_123-xyz')).toEqual(['t.me/joinchat/AbC_123-xyz']);
});

test('keeps legacy joinchat hash for telegram.me', () => {
  expect(extractTelegramLinks('see https://telegram.me/joinchat/AbC_123-xyz now')).toEqual(['t.me/joinchat/AbC_123-xyz']);
});

test('bare joinchat without hash is not reported as a channel', () => {
  expect(extractTelegramLinks('https://t.me/joinchat')).toEqual([]);
});

test('existing formats still work', () => {
  expect(extractTelegramLinks('https://t.me/+AbC_1 t.me/somechannel https://t.me/c/123/45 @user')).toEqual([
    't.me/+AbC_1', 't.me/somechannel', 't.me/c/123/45', 't.me/user'
  ]);
});

test('channel names starting with joinchat are kept', () => {
  expect(extractTelegramLinks('t.me/joinchatters')).toEqual(['t.me/joinchatters']);
});
