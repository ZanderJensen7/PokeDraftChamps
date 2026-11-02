import { describe, expect, it } from 'vitest';

declare global {
  interface ImportMeta {
    glob(pattern: string, opts: { query: '?raw'; import: 'default'; eager: true }): Record<string, string>;
  }
}

// Every engine source file as text, keyed './dir/file.ts' (relative to src/).
const sources = import.meta.glob('./**/*.ts', { query: '?raw', import: 'default', eager: true });
const SIM_PACKAGES = ['@pkmn/sim', '@pkmn/randoms', '@smogon/calc'];

/** Value (non-type) import / export-from specifiers of a source file. */
function valueImports(src: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?[^'";]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[2]) continue; // `import type` / `export type` is erased
    out.push(m[3] ?? m[4]!);
  }
  return out;
}

function resolveRel(from: string, spec: string): string | undefined {
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  const base = parts.join('/');
  return [`${base}.ts`, `${base}/index.ts`].find((p) => p in sources);
}

/** Files reachable from an entry through value imports, and the external packages they import. */
function graph(entry: string): { files: Set<string>; packages: Map<string, string> } {
  const files = new Set<string>();
  const packages = new Map<string, string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    for (const spec of valueImports(sources[f]!)) {
      if (spec.startsWith('.')) {
        const r = resolveRel(f, spec);
        if (r) stack.push(r);
      } else if (!packages.has(spec)) packages.set(spec, f);
    }
  }
  return { files, packages };
}

describe('engine entries', () => {
  it('the main entry (@pdc/engine) never loads the simulator, randoms or the damage calc', () => {
    const { files, packages } = graph('./index.ts');
    expect(files.size).toBeGreaterThan(20);
    const leaks = SIM_PACKAGES.filter((p) => packages.has(p)).map((p) => `${p} via ${packages.get(p)}`);
    expect(leaks).toEqual([]);
  });

  it('the battle entry (@pdc/engine/battle) is where the sim lives', () => {
    const { packages } = graph('./battle/index.ts');
    for (const p of SIM_PACKAGES) expect(packages.has(p)).toBe(true);
  });
});
