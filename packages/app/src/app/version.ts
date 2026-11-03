const version = __APP_VERSION__;
const commit = __APP_COMMIT__;
const builtAt = __APP_BUILT_AT__;
const channel = __APP_CHANNEL__;

/** Build stamp: version from package.json, short commit, build day. Injected by vite.config.ts. */
export const APP_VERSION = {
  version,
  commit,
  builtAt,
  channel,
  /** e.g. "v0.2.0 · early build · d24c319" */
  label: `v${version} · ${channel} · ${commit}`,
} as const;

export const REPO_URL = 'https://github.com/ZanderJensen7/PokeDraftChamps';
