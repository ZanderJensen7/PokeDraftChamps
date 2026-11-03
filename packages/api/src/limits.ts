/** Every tunable number of the API in one table. */
export const LIMITS = {
  /** Entries kept per daily board (lowest dropped beyond this). */
  dailyCap: 500,
  /** Entries returned per page of a daily board. */
  pageSize: 100,
  nicknameMin: 1,
  nicknameMax: 20,
  scoreMax: 1_000_000,
  seedMax: 4_294_967_295,
  runIdMin: 1,
  runIdMax: 64,
  abbrevMax: 4,
  resultMax: 40,
  versionMax: 20,
  /** Max request body for POST /daily/:date, in bytes. */
  dailyBodyMaxBytes: 4 * 1024,
  /** Max request body for POST /runs, in bytes. */
  runBodyMaxBytes: 16 * 1024,
  /** Run summaries expire after this many seconds (90 days). */
  runTtlSeconds: 90 * 24 * 60 * 60,
  /** Distinct versions tracked in runs:stats before new ones fold into "other". */
  maxVersions: 50,
  teamSizes: [8, 12, 16],
  eliminationReasons: ['lossCap', 'missedPlayoffs', 'playoffLoss'],
  phases: ['champion', 'eliminated'],
} as const;
