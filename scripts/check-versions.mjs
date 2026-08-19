#!/usr/bin/env node
// Fails when the version-bearing files disagree, so a half-done bump cannot
// reach main. Pass --expect <version> (or a bare version) to also require a
// specific value — the release workflow uses that to match the git tag.
import { readAllVersions } from './versions.mjs';

const args = process.argv.slice(2);
const expectIdx = args.indexOf('--expect');
const expected = expectIdx !== -1 ? args[expectIdx + 1] : args[0];

const versions = readAllVersions();
const width = Math.max(...versions.map(v => v.file.length));
for (const { file, version } of versions) {
  console.log(`${file.padEnd(width)}  ${version}`);
}

const distinct = [...new Set(versions.map(v => v.version))];
if (distinct.length > 1) {
  console.error(`\nError: version mismatch across ${distinct.length} values: ${distinct.join(', ')}`);
  console.error('Run "npm run bump <version>" to set every file at once.');
  process.exit(1);
}

if (expected && distinct[0] !== expected) {
  console.error(`\nError: expected version ${expected}, found ${distinct[0]}.`);
  console.error('The version bump belongs in the change commit, before the PR is merged.');
  process.exit(1);
}

console.log(`\nAll versions agree: ${distinct[0]}`);
