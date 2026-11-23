import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// D542 — browser code reads image and video models from the catalog. Only type imports and the
// id constants that name model-specific behaviour may still come from the code registries.
const ROOTS = ["src/app", "src/components", "src/hooks", "src/lib/canvas-store.ts"];
const ALLOWED = new Set([
  "GEMINI_OMNI_11_MODEL_ID", "GEMINI_OMNI_12_MODEL_ID", "GEMINI_OMNI_MODEL_ID",
  "KLING_OMNI_MODEL_ID", "SEEDANCE_MODEL_ID",
]);

function files(p: string): string[] {
  const abs = join(process.cwd(), p);
  try {
    return readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(p, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(p, e.name)] : [],
    );
  } catch {
    return [p];
  }
}

describe("browser code does not read the code model registries", () => {
  it("imports only types and id constants from client-models", () => {
    const offenders: string[] = [];
    const re = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["'][^"']*(image-gen|video-gen)\/client-models["']/g;
    for (const f of ROOTS.flatMap(files)) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const m of src.matchAll(re)) {
        if (m[1]) continue;
        const names = m[2].split(",").map((s) => s.trim()).filter(Boolean).filter((s) => !s.startsWith("type "));
        const bad = names.filter((n) => !ALLOWED.has(n));
        if (bad.length) offenders.push(`${relative(process.cwd(), f)}: ${bad.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
