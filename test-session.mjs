#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import dotenvx from '@dotenvx/dotenvx';

console.log('🧪 Testing Telegram session management with dotenvx...\n');

// Test session strings
const TEST_SESSION = 'TEST_SESSION_STRING_1234567890_DUMMY_DATA';
const UPDATED_SESSION = 'UPDATED_SESSION_STRING_ABC_XYZ_789';

async function testSessionManagement() {
  const envPath = path.resolve(process.cwd(), '.env');
  
  // Ensure .env file exists
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, '');
    console.log('📄 Created empty .env file\n');
  } else {
    console.log('📄 Using existing .env file\n');
  }
  
  try {
    // 1. Test writing session to .env using dotenvx
    console.log('1️⃣ Testing session write with dotenvx.set()...');
    
    dotenvx.set('TELEGRAM_USER_SESSION', TEST_SESSION, { 
      path: '.env',
      encrypt: false  // Disable encryption for plain text storage
    });
    console.log(`  ✅ Set TELEGRAM_USER_SESSION=${TEST_SESSION}`);
    
    // 2. Test reading session from .env
    console.log('\n2️⃣ Testing session read...');
    
    // Show file contents
    const savedEnv = await fs.promises.readFile(envPath, 'utf8');
    console.log('  📁 File contents:');
    console.log('  ' + savedEnv.trim().replace(/\n/g, '\n  '));
    
    // Parse the session from file
    const sessionMatch = savedEnv.match(/TELEGRAM_USER_SESSION=(.+)/);
    const retrievedSession = sessionMatch ? sessionMatch[1].replace(/^["']|["']$/g, '') : null;
    
    if (retrievedSession === TEST_SESSION) {
      console.log('\n  ✅ Session parsed correctly from file');
    } else {
      console.log('\n  ❌ Failed to parse session from file');
      console.log(`  Expected: ${TEST_SESSION}`);
      console.log(`  Got: ${retrievedSession}`);
    }
    
    // Reload and check with dotenvx
    dotenvx.config();
    
    const sessionFromDotenvx = dotenvx.get('TELEGRAM_USER_SESSION');
    if (sessionFromDotenvx === TEST_SESSION) {
      console.log('  ✅ Session retrieved via dotenvx.get()');
    } else {
      console.log('  ❌ Failed to retrieve via dotenvx.get()');
      console.log(`  Expected: ${TEST_SESSION}`);
      console.log(`  Got: ${sessionFromDotenvx}`);
    }
    
    if (process.env.TELEGRAM_USER_SESSION === TEST_SESSION) {
      console.log('  ✅ Session loaded into process.env');
    } else {
      console.log('  ⚠️  Session not in process.env');
    }
    
    // 3. Test updating existing session
    console.log('\n3️⃣ Testing session update...');
    
    dotenvx.set('TELEGRAM_USER_SESSION', UPDATED_SESSION, { 
      path: '.env',
      encrypt: false
    });
    console.log(`  ✅ Updated session to: ${UPDATED_SESSION}`);
    
    // Verify update
    const updatedEnv = await fs.promises.readFile(envPath, 'utf8');
    console.log('\n  📁 Updated file contents:');
    console.log('  ' + updatedEnv.trim().replace(/\n/g, '\n  '));
    
    // Reload and verify
    dotenvx.config();
    const updatedFromDotenvx = dotenvx.get('TELEGRAM_USER_SESSION');
    
    if (updatedFromDotenvx === UPDATED_SESSION) {
      console.log('\n  ✅ Session update successful');
    } else {
      console.log('\n  ❌ Session update failed');
      console.log(`  Expected: ${UPDATED_SESSION}`);
      console.log(`  Got: ${updatedFromDotenvx}`);
    }
    
    // 4. Test with other env variables present
    console.log('\n4️⃣ Testing with other environment variables...');
    
    // Add another variable
    dotenvx.set('VK_ACCESS_TOKEN', 'test_vk_token_123', { 
      path: '.env',
      encrypt: false
    });
    console.log('  ✅ Added VK_ACCESS_TOKEN');
    
    // Update session again
    const FINAL_SESSION = 'FINAL_SESSION_WITH_OTHER_VARS';
    dotenvx.set('TELEGRAM_USER_SESSION', FINAL_SESSION, { 
      path: '.env',
      encrypt: false
    });
    console.log(`  ✅ Updated session to: ${FINAL_SESSION}`);
    
    // Show final state
    const finalEnv = await fs.promises.readFile(envPath, 'utf8');
    console.log('\n  📁 Final .env contents:');
    console.log('  ' + finalEnv.trim().replace(/\n/g, '\n  '));
    
    // Verify both values are preserved
    dotenvx.config();
    const finalSession = dotenvx.get('TELEGRAM_USER_SESSION');
    const vkToken = dotenvx.get('VK_ACCESS_TOKEN');
    
    if (finalSession === FINAL_SESSION && vkToken === 'test_vk_token_123') {
      console.log('\n  ✅ Both environment variables preserved correctly');
    } else {
      console.log('\n  ❌ Environment variable preservation failed');
    }
    
    console.log('\n✨ All tests completed!');
    console.log('\n📌 Your .env file now contains test values.');
    console.log('   You should update it with your real credentials.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testSessionManagement().catch(console.error);