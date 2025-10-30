#!/usr/bin/env node

/**
 * Test script to verify that the cache clearing logic works correctly
 * This simulates the auto-follow loop behavior
 */

import { lino, CACHE_FILES } from '../lino.lib.mjs';

console.log('🧪 Testing cache clearing logic\n');

// Test 1: Save some rejected chats
console.log('Test 1: Saving rejected chats to cache...');
const rejectedChats = [1159, 1158, 1163, 1162];
const cacheFile1 = lino.saveToCache(CACHE_FILES.VK_CHATS, rejectedChats);
console.log(`✅ Saved ${rejectedChats.length} chats to: ${cacheFile1}`);

// Test 2: Check if cache has rejected chats
console.log('\nTest 2: Checking if cache has rejected chats...');
const cache1 = lino.loadFromCache(CACHE_FILES.VK_CHATS);
if (cache1 && cache1.numericIds && cache1.numericIds.length > 0) {
  console.log(`✅ Cache has ${cache1.numericIds.length} rejected chat(s): ${cache1.numericIds.join(', ')}`);
} else {
  console.log('❌ Cache is empty or missing!');
}

// Test 3: Clear the cache (simulating successful message delivery)
console.log('\nTest 3: Clearing cache (simulating success)...');
const cacheFile2 = lino.saveToCache(CACHE_FILES.VK_CHATS, []);
console.log(`✅ Cleared cache: ${cacheFile2}`);

// Test 4: Verify cache is empty
console.log('\nTest 4: Verifying cache is empty...');
const cache2 = lino.loadFromCache(CACHE_FILES.VK_CHATS);
if (cache2 && cache2.numericIds && cache2.numericIds.length === 0) {
  console.log('✅ Cache is correctly empty (length: 0)');
} else if (!cache2) {
  console.log('❌ Cache file was deleted (should exist but be empty)');
} else {
  console.log(`❌ Cache still has ${cache2.numericIds.length} chats!`);
}

// Test 5: Simulate hasRejectedChats() check
console.log('\nTest 5: Simulating hasRejectedChats() check...');
function hasRejectedChats() {
  try {
    const cache = lino.loadFromCache(CACHE_FILES.VK_CHATS);
    if (!cache || !cache.numericIds || cache.numericIds.length === 0) {
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}

const hasRejected = hasRejectedChats();
if (!hasRejected) {
  console.log('✅ hasRejectedChats() correctly returns false (loop should stop)');
} else {
  console.log('❌ hasRejectedChats() returns true (loop would continue!)');
}

console.log('\n🎉 Test complete!');
