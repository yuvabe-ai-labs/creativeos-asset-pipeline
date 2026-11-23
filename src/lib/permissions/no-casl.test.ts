import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// D542: one checker on server and browser; CASL, the area catalogue and presets are removed.
const GONE = ["catalogue", "effective", "presets", "node-area", "ability", "browser", "downloads", "access"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("the old permission model is gone", () => {
  it("has no CASL dependency", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => n.startsWith("@casl/"))).toEqual([]);
  });

  it("has none of the old modules", () => {
    for (const m of GONE) expect(existsSync(`src/lib/permissions/${m}.ts`), m).toBe(false);
    expect(existsSync("src/lib/db/presets.ts")).toBe(false);
  });

  it("imports none of them anywhere", () => {
    const anywhere = new RegExp(`@casl/|permissions/(${GONE.join("|")})"`);
    const relative = new RegExp(`from "\./(${GONE.join("|")})"`);
    const offenders = sourceFiles("src").filter((f) => {
      if (f.endsWith("no-casl.test.ts")) return false;
      const src = readFileSync(f, "utf8");
      const inPermissions = f.split(/[\/]/).join("/").includes("src/lib/permissions/");
      return anywhere.test(src) || (inPermissions && relative.test(src));
    });
    expect(offenders).toEqual([]);
  });
});
