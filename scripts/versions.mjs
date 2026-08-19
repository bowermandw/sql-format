// Shared list of the files that carry the project version.
// Keep this list in sync with any new package.json / lockfile added to the repo.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every tracked file whose "version" field must agree. */
export const VERSION_FILES = [
  'package.json',
  'package-lock.json',
  'vscode-extension/package.json',
  'vscode-extension/package-lock.json',
];

/** npm workspaces (directories with their own package.json + lockfile) to bump. */
export const PACKAGE_DIRS = ['.', 'vscode-extension'];

export function readVersion(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf8')).version;
}

/** Returns [{ file, version }] for every version-bearing file. */
export function readAllVersions() {
  return VERSION_FILES.map(file => ({ file, version: readVersion(file) }));
}
