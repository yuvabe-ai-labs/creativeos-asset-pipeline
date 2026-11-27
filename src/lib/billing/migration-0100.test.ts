import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0100_billing_history_indexes.sql"), "utf8");

describe("migration 0100", () => {
  it("indexes each paged billing list for its filter and newest-first sort, safely re-runnable", () => {
    expect(SQL).toContain("on billing_log (org_id, created_at desc)");
    expect(SQL).toContain("on billing_payments (org_id, created_at desc)");
    expect(SQL).toContain("where status <> 'created' and kind <> 'test'");
    expect(SQL).toContain("on billing_subscriptions (status, current_period_end)");
    expect(SQL).toContain("drop index if exists billing_log_org_id_idx;");
    expect(SQL).toContain("drop index if exists billing_payments_org_id_idx;");
    expect(SQL).not.toMatch(/create index (?!if not exists)/);
  });
});
