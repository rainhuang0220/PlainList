#!/usr/bin/env node
/**
 * Prepare a clean staging dir for electron-builder.
 *
 * Why: electron-builder runs in apps/web/ and follows @plainlist/shared,
 * @plainlist/api workspace symlinks. Asar packaging rejects files outside
 * the project dir. Copying dist/ + electron/ + a trimmed package.json to
 * a sibling staging dir avoids the symlink traversal entirely.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const stage = path.resolve(__dirname, '..', '.electron-stage');
const src = path.resolve(__dirname, '..');

console.log(`[prepare-electron] staging ${src} -> ${stage}`);

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const dstPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      // skip ._* macOS resource forks
      if (entry.name.startsWith('._')) continue;
      fs.copyFileSync(srcPath, dstPath);
    } else if (entry.isSymbolicLink()) {
      // resolve symlinks to real files to avoid asar path restrictions
      const real = fs.realpathSync(srcPath);
      const stat = fs.statSync(real);
      if (stat.isDirectory()) {
        copyDir(real, dstPath);
      } else {
        fs.copyFileSync(real, dstPath);
      }
    }
  }
}

for (const dir of ['dist', 'electron', 'build']) {
  const from = path.join(src, dir);
  if (fs.existsSync(from)) {
    copyDir(from, path.join(stage, dir));
  }
}

// trimmed package.json: just the fields electron-builder needs at the asar root
const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
const stagePkg = {
  name: pkg.name,
  productName: pkg.productName || 'PlainList',
  version: pkg.version,
  description: pkg.description || 'PlainList — personal time management',
  author: pkg.author || 'rainhuang',
  main: 'electron/main.cjs',
};
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(stagePkg, null, 2) + '\n');

// install electron into the stage so electron-builder can find it
const { execSync } = require('node:child_process');
console.log('[prepare-electron] running npm install in stage...');
try {
  execSync('npm install --no-save --omit=dev --omit=peer electron@33.4.11', {
    cwd: stage,
    stdio: 'inherit',
  });
} catch (err) {
  console.error('[prepare-electron] npm install failed:', err.message);
  process.exit(1);
}

console.log('[prepare-electron] done.');
