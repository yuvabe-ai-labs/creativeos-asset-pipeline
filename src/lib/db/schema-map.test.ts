// src/lib/db/schema-map.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// docs/database-schema.md is the map agents read before changing the database. This keeps it
// from falling behind: every table and view that still exists after all migrations must have a
// heading there. Parsing is deliberately loose (case, `if not exists`, `public.`, quotes).
const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const MAP = readFileSync(join(process.cwd(), "docs/database-schema.md"), "utf8");

const STATEMENT =
  /\b(create|drop)\s+(?:or\s+replace\s+)?(?:materialized\s+)?(table|view)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;

function liveRelations(): Map<string, "table" | "view"> {
  const live = new Map<string, "table" | "view">();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/--[^\n]*/g, "");
    for (const [, verb, kind, name] of sql.matchAll(STATEMENT)) {
      const key = name.toLowerCase();
      if (verb.toLowerCase() === "create") live.set(key, kind.toLowerCase() as "table" | "view");
      else live.delete(key);
    }
  }
  return live;
}

function hasHeading(name: string): boolean {
  return new RegExp(`^#{2,4}\\s.*\\b${name}\\b`, "m").test(MAP);
}

describe("docs/database-schema.md", () => {
  const live = liveRelations();

  it("finds the tables and views the migrations create", () => {
    expect(live.get("organizations")).toBe("table");
    expect(live.get("membership_clients")).toBe("table");
    expect(live.get("review_queue_items")).toBe("view");
  });

  it("has a heading for every table and view that exists after all migrations", () => {
    const missing = [...live.keys()].filter((name) => !hasHeading(name));
    expect(missing).toEqual([]);
  });

  it("names the last migration it was built from", () => {
    const last = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort().at(-1)!;
    expect(MAP).toMatch(new RegExp(`up to \\*{0,2}${last.slice(0, 4)}\\b`));
  });
});
