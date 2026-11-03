/// <reference types="vite/client" />

/** Build-time constants injected by `define` in vite.config.ts. */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT_AT__: string;
declare const __APP_CHANNEL__: string;

/** Optional build env (see packages/app/.env.example). Unset = the feature is off. */
interface ImportMetaEnv {
  /** Base URL of the PokeDraftChamps API worker (daily leaderboard, run summaries). */
  readonly VITE_PDC_API_URL?: string;
  /** Cloudflare Web Analytics beacon token (cookieless page views). */
  readonly VITE_CF_BEACON_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
