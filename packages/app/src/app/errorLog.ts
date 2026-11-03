const MAX = 5;
const errors: string[] = [];

function push(msg: string) {
  errors.push(msg.slice(0, 300));
  if (errors.length > MAX) errors.shift();
}

/** Keeps the last few uncaught errors so the bug report can include them. */
export function installErrorLog() {
  window.addEventListener('error', (e) => push(`${e.message} (${e.filename?.split('/').pop() ?? '?'}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown;
    push(`Unhandled rejection: ${r instanceof Error ? r.message : String(r)}`);
  });
}

export function recentErrors(): readonly string[] {
  return errors;
}
