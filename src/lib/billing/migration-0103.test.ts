import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins what the plan moves read and write (D593).
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0103_plan_price_moves.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};

describe("migration 0103", () => {
  it("adds where a move stands, re-runnably, with the refusals the code knows", () => {
    expect(SQL).toContain("alter table billing_subscriptions add column if not exists next_price_scheduled_at timestamptz;");
    expect(SQL).toContain("alter table billing_subscriptions add column if not exists next_price_refused text;");
    expect(SQL).toContain("check (next_price_refused is null or next_price_refused in ('upi', 'emandate', 'other'))");
    expect(SQL).toContain("if not exists (select 1 from pg_constraint where conname = 'billing_subscriptions_next_price_refused_check')");
    expect(SQL).toContain("create index if not exists billing_subscriptions_pending_move_idx on billing_subscriptions (updated_at)");
  });

  it("clears the answer when the next price changes, unless the same update gives one", () => {
    const body = fn("billing_subscriptions_next_price_reset");
    expect(body).toContain("if new.next_price_id is distinct from old.next_price_id then");
    expect(body).toContain("new.next_price_scheduled_at := null;");
    expect(body).toContain("new.next_price_refused := null;");
    expect(SQL).toContain("drop trigger if exists billing_subscriptions_next_price_reset on billing_subscriptions;");
    expect(SQL).toContain("before update of next_price_id on billing_subscriptions");
  });

  it("moves running plans and unpaid checkouts, never a cancelled one or an owner's own choice", () => {
    const body = fn("admin_save_offer");
    expect(body).toContain("where s.status in ('created', 'active', 'payment_due')");
    expect(body).toContain("((s.price_id = v_price.id and s.next_price_id is null) or s.next_price_id = v_price.id)");
    expect(body).toContain("next_price_scheduled_at = null, next_price_refused = null");
    expect(body).toContain("count(*) filter (where moved.status in ('active', 'payment_due'))");
    expect(body).toContain("returns table (product_id uuid, price_changed boolean, moved_count integer)");
  });

  it("saves Razorpay's answer once, only while the plan still moves there, and logs it on the agency", () => {
    const body = fn("record_plan_move");
    expect(body).toContain("for update");
    expect(body).toMatch(/v_sub\.next_price_id is distinct from p_price_id then\s+return false;/);
    expect(body).toContain("(p_refused is not null and v_sub.next_price_refused = p_refused)");
    expect(body).toContain("next_price_scheduled_at = case when p_refused is null then now() else null end");
    expect(body).toContain("values (v_sub.org_id, null, 'plan_move',");
    expect(body).toContain("'starts_at', v_sub.current_period_end, 'refused', p_refused");
  });

  it("groups the moves for Admin, running plans only, naming the agencies refused", () => {
    const body = fn("admin_price_moves");
    expect(body).toContain("where s.status in ('active', 'payment_due')");
    expect(body).toContain("when s.next_price_refused is not null then 'refused'");
    expect(body).toContain("when s.next_price_scheduled_at is not null then 'scheduled'");
    expect(body).toContain("else 'waiting' end as state");
    expect(body).toContain("jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name)");
  });

  it("runs only for the server", () => {
    for (const name of ["admin_save_offer", "record_plan_move", "admin_price_moves"]) {
      expect(fn(name), name).toContain("security definer");
      expect(fn(name), name).toContain("set search_path = public");
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
    }
    expect(fn("billing_subscriptions_next_price_reset")).toContain("set search_path = public");
    expect(SQL.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
