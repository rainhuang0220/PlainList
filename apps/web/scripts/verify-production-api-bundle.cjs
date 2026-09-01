#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const CANONICAL_API_ORIGIN = 'https://plainlist.space';
const RETIRED_PUBLIC_IP = /https?:\/\/175\.24\.134\.228/;

function collectJavaScriptFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

function verifyRendererSources(contents) {
  if (!contents.some((source) => source.includes(CANONICAL_API_ORIGIN))) {
    throw new Error(`renderer bundle is missing canonical API origin ${CANONICAL_API_ORIGIN}`);
  }
  if (contents.some((source) => RETIRED_PUBLIC_IP.test(source))) {
    throw new Error('renderer bundle contains retired public-IP API origin');
  }
}

function verifyProductionApiBundle(bundleDir) {
  const files = collectJavaScriptFiles(bundleDir);
  verifyRendererSources(files.map((file) => fs.readFileSync(file, 'utf8')));
}

if (require.main === module) {
  const bundleDir = process.argv[2];
  if (!bundleDir) {
    console.error('usage: verify-production-api-bundle.cjs <renderer-bundle-directory>');
    process.exit(2);
  }
  try {
    verifyProductionApiBundle(bundleDir);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { verifyProductionApiBundle, verifyRendererSources };
