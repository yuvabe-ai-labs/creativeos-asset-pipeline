import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SENIOR_DEFAULT_KEYS, MEDIA_APPROVE_KEYS } from "./presets";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0062_permission_based_access.sql"), "utf8");

function between(start: string, end: string): string[] {
  const s = SQL.indexOf(start);
  const e = SQL.indexOf(end);
  if (s < 0 || e < 0) throw new Error(`markers ${start} / ${end} not found`);
  return [...SQL.slice(s, e).matchAll(/'([a-z_]+\.[a-z]+)'/g)].map((m) => m[1]);
}

describe("migration 0062 seeds the presets in presets.ts", () => {
  it("senior keys match", () => {
    expect(between("-- seed:senior-keys:start", "-- seed:senior-keys:end").sort()).toEqual([...SENIOR_DEFAULT_KEYS].sort());
  });

  it("designer drops exactly the media approve keys", () => {
    expect(between("-- seed:designer-drops:start", "-- seed:designer-drops:end").sort()).toEqual([...MEDIA_APPROVE_KEYS].sort());
  });
});
