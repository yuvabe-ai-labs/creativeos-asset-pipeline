import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins what the owners' credit emails read and write (D596).
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0105_owner_credit_emails.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.search(new RegExp(`create (or replace )?function ${name}\\(`));
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};
const NAMES = ["billing_owner_emails_due", "claim_low_credits_email", "release_low_credits_email", "claim_free_ending_email", "release_free_ending_email"];

describe("migration 0105", () => {
  it("adds the two once-only columns re-runnably, and an index for the free grants ending", () => {
    expect(SQL).toContain("alter table organizations add column if not exists low_credits_warned_at timestamptz;");
    expect(SQL).toContain("alter table credit_grants add column if not exists ending_warned_at timestamptz;");
    expect(SQL).toMatch(/create index if not exists credit_grants_free_ending_idx on credit_grants \(ends_at\)\s+where kind = 'free' and ending_warned_at is null;/);
  });

  it("finds low credits on paying agencies only, once per credit period", () => {
    const body = fn("billing_owner_emails_due");
    expect(body).toContain("o.billing_mode = 'plans'");
    expect(body).toContain("where g.starts_at <= now() and g.ends_at > now()");
    expect(body).toContain("(t.total - t.left_credits) / t.total >= p_low_share");
    expect(body).toContain("t.left_credits > 0");
    expect(body).toContain("greatest(g.created_at, g.starts_at) as arrived_at");
    expect(body).toContain("(o.low_credits_warned_at is null or t.arrived_at > o.low_credits_warned_at)");
  });

  it("finds free grants ending soon, given early enough, with no live plan, once per grant", () => {
    const body = fn("billing_owner_emails_due");
    expect(body).toContain("g.kind = 'free' and g.ending_warned_at is null");
    expect(body).toContain("g.ends_at > now() and g.ends_at <= now() + p_notice");
    expect(body).toContain("g.ends_at - g.created_at >= p_notice");
    expect(body).toContain("g.credits - g.used > 0");
    expect(body).toContain("s.status in ('active', 'cancelling', 'payment_due', 'scheduled')");
  });

  it("reads the owners' emails in the same query and leaves out agencies without one", () => {
    const body = fn("billing_owner_emails_due");
    expect(body).toContain("join auth.users u on u.id = m.user_id");
    expect(body).toContain("m.is_owner");
    expect(body).toContain("where owners.emails is not null");
    expect(body).toContain("limit p_limit");
  });

  it("claims each send once and gives back only its own claim", () => {
    expect(fn("claim_low_credits_email")).toContain("o.low_credits_warned_at is not distinct from p_seen");
    expect(fn("release_low_credits_email")).toContain("o.low_credits_warned_at = p_claimed");
    expect(fn("claim_free_ending_email")).toContain("g.ending_warned_at is null");
    expect(fn("release_free_ending_email")).toContain("g.ending_warned_at = p_claimed");
  });

  it("keeps every function definer, service role only, and reloads the schema", () => {
    for (const sig of [
      "billing_owner_emails_due(numeric, interval, integer)",
      "claim_low_credits_email(uuid, timestamptz)",
      "release_low_credits_email(uuid, timestamptz, timestamptz)",
      "claim_free_ending_email(uuid)",
      "release_free_ending_email(uuid, timestamptz)",
    ]) {
      expect(SQL).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
      expect(SQL).toContain(`grant execute on function ${sig} to service_role;`);
    }
    for (const name of NAMES) expect(fn(name)).toMatch(/security definer\r?\nset search_path = public/);
    expect(SQL.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
