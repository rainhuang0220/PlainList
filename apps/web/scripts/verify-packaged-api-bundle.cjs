#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { verifyRendererSources } = require('./verify-production-api-bundle.cjs');

function verifyPackagedApiBundle(appPath) {
  const archive = path.join(appPath, 'Contents', 'Resources', 'app.asar');
  if (!fs.existsSync(archive)) {
    throw new Error(`packaged app is missing ${archive}`);
  }

  const files = asar.listPackage(archive).map((file) => file.replace(/^\//, ''));
  const rendererSources = files
    .filter((file) => /^dist\/assets\/.*\.js$/.test(file))
    .map((file) => asar.extractFile(archive, file).toString('utf8'));
  verifyRendererSources(rendererSources);

  const main = asar.extractFile(archive, 'electron/main.cjs').toString('utf8');
  if (/\.setProxy\s*\(/.test(main)) {
    throw new Error('packaged app overrides system proxy settings');
  }
  if (/https?:\/\/175\.24\.134\.228/.test(main)) {
    throw new Error('packaged app contains the retired public-IP API origin');
  }
}

if (require.main === module) {
  const appPath = process.argv[2];
  if (!appPath) {
    console.error('usage: verify-packaged-api-bundle.cjs <PlainList.app>');
    process.exit(2);
  }
  try {
    verifyPackagedApiBundle(appPath);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { verifyPackagedApiBundle };
