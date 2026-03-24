#!/usr/bin/env node
import { discoverAllPages, buildKnowledgeBase } from './scraper.js';
import { saveKnowledgeBase } from './kb.js';

async function main() {
  console.log('🔍 BSV Academy MCP — Scraping knowledge base...\n');

  const pages = await discoverAllPages((msg) => console.log(`  ${msg}`));

  if (pages.length === 0) {
    console.error('❌ No pages extracted. Check network connectivity.');
    process.exit(1);
  }

  const kb = buildKnowledgeBase(pages);
  const path = await saveKnowledgeBase(kb);

  console.log(`\n✅ Knowledge base built:`);
  console.log(`   Courses: ${kb.totalTopics}`);
  console.log(`   Sections: ${kb.totalSections}`);
  console.log(`   Concepts: ${kb.totalConcepts}`);
  console.log(`   Saved to: ${path}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
