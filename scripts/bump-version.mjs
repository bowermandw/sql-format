#!/usr/bin/env node
// Bumps the version everywhere in one step: the root package (package.json +
// package-lock.json) and the VS Code extension package. Run it as part of the
// change commit so the PR that gets merged already carries the new version.
//
//   npm run bump 0.1.11
//   npm run bump patch|minor|major
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, PACKAGE_DIRS, readAllVersions } from './versions.mjs';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npm run bump <version|patch|minor|major>');
  process.exit(1);
}

// Resolve keywords (patch/minor/major) against the root package first so every
// package lands on the identical literal version.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cwd, args) =>
  execFileSync(npm, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

const resolved = run(ROOT, ['version', target, '--no-git-tag-version', '--allow-same-version'])
  .replace(/^v/, '');

for (const dir of PACKAGE_DIRS.slice(1)) {
  run(join(ROOT, dir), ['version', resolved, '--no-git-tag-version', '--allow-same-version']);
}

for (const { file, version } of readAllVersions()) {
  console.log(`${file}: ${version}`);
}
console.log(`\nBumped to ${resolved}. Commit these files with your change, then after the PR merges:`);
console.log(`  git tag -a v${resolved} -m "v${resolved}" && git push origin v${resolved}`);
