import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0075_billing_realtime.sql"), "utf8");

describe("migration 0075", () => {
  it("publishes new credits and plan changes for live updates, safely re-runnable", () => {
    expect(SQL).toContain("alter publication supabase_realtime add table credit_grants;");
    expect(SQL).toContain("alter publication supabase_realtime add table billing_subscriptions;");
    expect(SQL.match(/if not exists \(/g)?.length).toBe(2);
  });
});
