#!/usr/bin/env node

import { Parser as LinoParser } from 'links-notation';

// Test parsing the Lino input format for telegram-follow.mjs
const testInput = `(
  t.me/JokedCat
  t.me/Master_Mystic
  t.me/Mishka_Hamster
)`;

console.log('Testing Lino parser for telegram-follow.mjs\n');
console.log('Input:', testInput);
console.log('\n' + '='.repeat(50));

const parser = new LinoParser();
const parsed = parser.parse(testInput);

console.log('\nParsed structure:', JSON.stringify(parsed, null, 2));

// Extract links like telegram-follow.mjs does
const links = [];
if (parsed && parsed.length > 0) {
  const link = parsed[0];
  
  if (link.values && link.values.length > 0) {
    for (const value of link.values) {
      const linkStr = value.id || value;
      if (typeof linkStr === 'string') {
        links.push(linkStr);
      }
    }
  } else if (link.id) {
    links.push(link.id);
  }
}

console.log('\nExtracted links:', links);
console.log(`\n✅ Successfully parsed ${links.length} links`);