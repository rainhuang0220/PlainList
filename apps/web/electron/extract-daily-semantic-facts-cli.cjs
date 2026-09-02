#!/usr/bin/env node
const { writeFile } = require('node:fs/promises');
const path = require('node:path');
const { archiveMeetsHistoricalStart, DEFAULT_HISTORICAL_START_DATE, parseArchive, scanArchiveDirectory } = require('./chatgpt-local-sync.cjs');
const { extractDailySemanticFacts } = require('./daily-semantic-fact.cjs');

async function main() {
  const archiveRoot = process.argv[2];
  const outputPath = process.argv[3];
  if (!archiveRoot || !outputPath) {
    console.error('usage: node extract-daily-semantic-facts-cli.cjs <archiveRoot> <output.json>');
    process.exit(1);
  }
  const scanned = await scanArchiveDirectory(archiveRoot);
  const factsByConversation = {};
  let conversations = 0;
  let facts = 0;
  for (const archive of scanned.archives) {
    if (!archiveMeetsHistoricalStart(archive, DEFAULT_HISTORICAL_START_DATE)) continue;
    const parsed = archive.messages ? archive : parseArchive(archive);
    const extracted = extractDailySemanticFacts(parsed);
    if (!extracted.length) continue;
    factsByConversation[parsed.conversationId] = extracted;
    conversations += 1;
    facts += extracted.length;
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    archiveRoot: path.resolve(archiveRoot),
    conversations,
    facts,
    factsByConversation,
  };
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ conversations, facts, outputPath, transcript: false }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'extract failed');
  process.exit(1);
});
