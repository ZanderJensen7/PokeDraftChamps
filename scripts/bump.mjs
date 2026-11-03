// Bump the version everywhere at once: `npm run bump -- patch|minor|major`.
// Bumps the root and both workspace package.json files (and the lockfile) with npm, then turns CHANGELOG.md's
// "Unreleased" section into the new version's section dated today. Nothing is committed: commit, then tag with
// `git tag vX.Y.Z && git push --tags` when you push.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const kind = process.argv[2];
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('usage: npm run bump -- patch|minor|major');
  process.exit(1);
}

execSync(`npm version ${kind} --workspaces --include-workspace-root --no-git-tag-version`, { stdio: 'inherit' });
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

// Local date, not UTC: an evening bump should carry today's date.
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const path = 'CHANGELOG.md';
let log = readFileSync(path, 'utf8');
const marker = /^## Unreleased[ \t]*\r?\n/m;
if (!marker.test(log)) {
  console.error('CHANGELOG.md has no "## Unreleased" section to release.');
  process.exit(1);
}
log = log.replace(marker, `## Unreleased\n\n## v${version} — ${today}\n`);
writeFileSync(path, log);

console.log(`\nv${version}: package.json files, package-lock.json and CHANGELOG.md updated.`);
console.log(`Next: review CHANGELOG.md, commit, then: git tag v${version} && git push origin main --tags`);
