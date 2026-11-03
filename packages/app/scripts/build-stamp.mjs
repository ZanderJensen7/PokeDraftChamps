import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Short git SHA: GITHUB_SHA in CI, else the local HEAD, else 'dev' (no git / no commits). */
export function commit() {
  const ci = process.env.GITHUB_SHA?.slice(0, 7);
  if (ci) return ci;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export function appVersion() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
}
