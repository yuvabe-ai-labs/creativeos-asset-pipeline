# Credit grants (billing piece 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paying agencies get a balance made of credit grants that end, used in end-date order; managed agencies behave exactly as today.

**Architecture:** Migration 0091 adds `billing_mode`/`plan_type` on `organizations`, the `credit_grants`, `credit_grant_uses` and `billing_log` tables, and four service-role functions (`reserve_credits_v2`, `settle_credits`, `refund_credits`, `credit_balance`). Each function locks the agency row, so one agency's holds and settlements run one at a time. The TypeScript ledger helpers keep their signatures and call the new functions, so none of the 19 call sites change.

**Tech Stack:** Supabase Postgres (plpgsql), Next.js server code, Vitest.

Spec: `docs/superpowers/specs/2026-11-20-credit-grants-design.md`.

## Global Constraints

- Never apply the migration or run SQL; the user applies it (staging first, then production).
- The old `reserve_credits` stays; 0092 drops it after this release is live.
- New functions: `security definer`, `set search_path = public`, execute for `service_role` only.
- RLS on every new table; owners read `credit_grants` only; no write policies.
- Grants order everywhere: `order by g.ends_at, g.created_at`.
- No Claude/AI attribution in commits. Never push.

---

### Task 1: Migration 0091 and its text test

**Files:**
- Create: `supabase/migrations/0091_credit_grants.sql`
- Test: `src/lib/billing/migration-0067.test.ts`

**Interfaces:**
- Produces: SQL functions
  - `reserve_credits_v2(p_org_id uuid, p_generation_id uuid, p_amount numeric) returns text` (`'ok' | 'limit' | 'used_up' | 'free_ended' | 'no_credits'`)
  - `settle_credits(p_org_id uuid, p_generation_id uuid, p_actual numeric) returns boolean`
  - `refund_credits(p_org_id uuid, p_generation_id uuid) returns boolean`
  - `credit_balance(p_org_id uuid) returns table (grant_id uuid, kind text, credits numeric, used numeric, left_credits numeric, ends_at timestamptz)`

- [ ] **Step 1: Write the failing test** (`src/lib/billing/migration-0067.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SQL is checked by hand on staging (spec "Checking the SQL"); this pins the rules that keep the
// ledger safe: one agency at a time, end-date order, repeat calls change nothing, server only.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0091_credit_grants.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};
const FUNCTIONS = ["reserve_credits_v2", "settle_credits", "refund_credits", "credit_balance"];

describe("migration 0091", () => {
  it("keeps every existing agency managed and standard", () => {
    expect(SQL).toContain("billing_mode text not null default 'managed'");
    expect(SQL).toContain("plan_type text not null default 'standard'");
  });

  it("turns on RLS for the new tables and lets owners read only their grants", () => {
    for (const t of ["credit_grants", "credit_grant_uses", "billing_log"]) {
      expect(SQL, t).toContain(`alter table ${t} enable row level security;`);
    }
    expect(SQL).toContain('create policy "owners read" on credit_grants for select');
    expect(SQL.match(/create policy/g)?.length).toBe(1);
  });

  it("indexes what the functions filter on", () => {
    expect(SQL).toContain("on credit_grants (org_id, ends_at)");
    expect(SQL).toContain("on credit_grants (payment_id)");
    expect(SQL).toContain("on credit_grant_uses (grant_id)");
    expect(SQL).toContain("on billing_log (org_id)");
  });

  it("locks the agency first in each function that writes", () => {
    expect(fn("reserve_credits_v2")).toContain("from organizations where id = p_org_id for update");
    for (const name of ["settle_credits", "refund_credits"]) {
      expect(fn(name), name).toContain("perform 1 from organizations where id = p_org_id for update");
    }
  });

  it("uses the grant that ends first, first", () => {
    for (const name of ["reserve_credits_v2", "settle_credits", "credit_balance"]) {
      expect(fn(name), name).toContain("order by g.ends_at, g.created_at");
    }
  });

  it("keeps today's monthly limit for managed agencies", () => {
    const body = fn("reserve_credits_v2");
    expect(body).toContain("if v_mode = 'managed' then");
    expect(body).toContain("date_trunc('month', now() at time zone 'utc') at time zone 'utc'");
    expect(body).toContain("return 'limit';");
  });

  it("says why a paying agency was refused", () => {
    const body = fn("reserve_credits_v2");
    for (const r of ["used_up", "free_ended", "no_credits"]) expect(body).toContain(`return '${r}';`);
  });

  it("changes nothing when a run is settled or refunded twice", () => {
    for (const name of ["settle_credits", "refund_credits"]) {
      expect(fn(name), name).toContain("type in ('refund', 'consumption')");
      expect(fn(name), name).toContain("return false;");
    }
  });

  it("runs only for the server", () => {
    for (const name of FUNCTIONS) {
      expect(fn(name), name).toContain("security definer");
      expect(fn(name), name).toContain("set search_path = public");
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
    }
  });

  it("leaves the old reserve_credits in place for the release in between", () => {
    expect(SQL).not.toMatch(/drop function[^;]*reserve_credits\(/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/billing/migration-0067.test.ts`
Expected: FAIL, ENOENT for `0091_credit_grants.sql`.

- [ ] **Step 3: Write the migration** (`supabase/migrations/0091_credit_grants.sql`)

```sql
-- Billing piece 1: credit grants (spec 2026-11-20-credit-grants-design.md, D574).
-- A paying agency's credits are grants that end (free credits, plan months, top-ups, Yuvabe's
-- added credits). A run's hold is taken from the grant that ends first, and settling moves the
-- real cost onto the same grants. Managed agencies (every agency today) have no grants and keep
-- the monthly limit unchanged. Only the server writes; owners read their own grants.

alter table organizations
  add column billing_mode text not null default 'managed' check (billing_mode in ('managed', 'plans')),
  add column plan_type text not null default 'standard' check (plan_type in ('standard', 'custom'));

create table credit_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('free', 'plan', 'topup', 'admin')),
  credits numeric not null check (credits >= 0),
  -- Running total of this grant's rows in credit_grant_uses, kept by the functions below.
  used numeric not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  payment_id uuid references billing_payments(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index credit_grants_org_id_ends_at_idx on credit_grants (org_id, ends_at);
create index credit_grants_payment_id_idx on credit_grants (payment_id);

-- How much of each grant a run holds (before it ends) or used (after).
create table credit_grant_uses (
  generation_id uuid not null references generations(id) on delete cascade,
  grant_id uuid not null references credit_grants(id) on delete cascade,
  credits numeric not null check (credits >= 0),
  primary key (generation_id, grant_id)
);

create index credit_grant_uses_grant_id_idx on credit_grant_uses (grant_id);

-- Every billing change Yuvabe makes to an agency: who, what, before and after, why.
create table billing_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index billing_log_org_id_idx on billing_log (org_id);

alter table credit_grants enable row level security;
alter table credit_grant_uses enable row level security;
alter table billing_log enable row level security;

create policy "owners read" on credit_grants for select
  using (exists (
    select 1 from org_memberships m
     where m.user_id = auth.uid() and m.org_id = credit_grants.org_id and m.is_owner
  ));

-- Replaces reserve_credits (which stays until 0092 so the code from before this release keeps
-- working while the migration goes first). 'ok', or why the run was refused.
create or replace function reserve_credits_v2(
  p_org_id uuid,
  p_generation_id uuid,
  p_amount numeric
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_limit numeric;
  v_used numeric;
  v_left numeric;
  v_open integer;
  v_any integer;
  v_not_free integer;
  v_need numeric;
  v_take numeric;
  rec record;
begin
  select billing_mode, monthly_credit_limit into v_mode, v_limit
    from organizations where id = p_org_id for update;
  if not found then
    return 'no_credits';
  end if;

  if v_mode = 'managed' then
    -- Today's check: a null limit always proceeds.
    if v_limit is not null then
      select coalesce(sum(amount), 0) into v_used
        from credit_transactions
       where org_id = p_org_id
         and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
      if v_used + p_amount > v_limit then
        return 'limit';
      end if;
    end if;
  else
    select coalesce(sum(greatest(g.credits - g.used, 0)), 0), count(*) into v_left, v_open
      from credit_grants g
     where g.org_id = p_org_id and g.starts_at <= now() and g.ends_at > now();

    if v_left < p_amount then
      if v_open > 0 then
        return 'used_up';
      end if;
      select count(*), count(*) filter (where g.kind <> 'free') into v_any, v_not_free
        from credit_grants g where g.org_id = p_org_id;
      if v_any > 0 and v_not_free = 0 then
        return 'free_ended';
      end if;
      return 'no_credits';
    end if;

    v_need := p_amount;
    for rec in
      select g.id, greatest(g.credits - g.used, 0) as left_now
        from credit_grants g
       where g.org_id = p_org_id and g.starts_at <= now() and g.ends_at > now()
       order by g.ends_at, g.created_at
    loop
      exit when v_need <= 0;
      v_take := least(rec.left_now, v_need);
      if v_take > 0 then
        insert into credit_grant_uses (generation_id, grant_id, credits)
        values (p_generation_id, rec.id, v_take);
        update credit_grants set used = used + v_take where id = rec.id;
        v_need := v_need - v_take;
      end if;
    end loop;
  end if;

  insert into credit_transactions (org_id, generation_id, amount, type)
  values (p_org_id, p_generation_id, p_amount, 'reservation');

  return 'ok';
end;
$$;

-- A run ended well: refund the hold and record the real cost (as settleGeneration did), and move
-- the cost onto the grants the run held, first-ending first. Cost above the hold goes to open
-- grants with credits left, in end order; any rest stays on the last grant the run used. False
-- when the run was already settled or refunded.
create or replace function settle_credits(
  p_org_id uuid,
  p_generation_id uuid,
  p_actual numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved numeric;
  v_rest numeric;
  v_share numeric;
  v_last uuid;
  held record;
  rec record;
begin
  perform 1 from organizations where id = p_org_id for update;

  if exists (
    select 1 from credit_transactions
     where generation_id = p_generation_id and type in ('refund', 'consumption')
  ) then
    return false;
  end if;

  select coalesce(sum(amount), 0) into v_reserved
    from credit_transactions
   where generation_id = p_generation_id and type = 'reservation';

  insert into credit_transactions (org_id, generation_id, amount, type) values
    (p_org_id, p_generation_id, -v_reserved, 'refund'),
    (p_org_id, p_generation_id, p_actual, 'consumption');

  v_rest := p_actual;
  for held in
    select cu.grant_id, cu.credits
      from credit_grant_uses cu
      join credit_grants g on g.id = cu.grant_id
     where cu.generation_id = p_generation_id
     order by g.ends_at, g.created_at
  loop
    v_share := least(held.credits, v_rest);
    v_rest := v_rest - v_share;
    v_last := held.grant_id;
    update credit_grants set used = used - held.credits + v_share where id = held.grant_id;
    if v_share > 0 then
      update credit_grant_uses set credits = v_share
       where generation_id = p_generation_id and grant_id = held.grant_id;
    else
      delete from credit_grant_uses
       where generation_id = p_generation_id and grant_id = held.grant_id;
    end if;
  end loop;

  if v_last is not null and v_rest > 0 then
    for rec in
      select g.id, g.credits - g.used as left_now
        from credit_grants g
       where g.org_id = p_org_id and g.starts_at <= now() and g.ends_at > now()
         and g.credits > g.used
       order by g.ends_at, g.created_at
    loop
      exit when v_rest <= 0;
      v_share := least(rec.left_now, v_rest);
      insert into credit_grant_uses (generation_id, grant_id, credits)
      values (p_generation_id, rec.id, v_share)
      on conflict (generation_id, grant_id)
        do update set credits = credit_grant_uses.credits + excluded.credits;
      update credit_grants set used = used + v_share where id = rec.id;
      v_rest := v_rest - v_share;
    end loop;

    if v_rest > 0 then
      insert into credit_grant_uses (generation_id, grant_id, credits)
      values (p_generation_id, v_last, v_rest)
      on conflict (generation_id, grant_id)
        do update set credits = credit_grant_uses.credits + excluded.credits;
      update credit_grants set used = used + v_rest where id = v_last;
    end if;
  end if;

  return true;
end;
$$;

-- A run failed or was cancelled: refund the hold (as refundReservation did) and give the held
-- credits back to their grants. False when the run was already settled or refunded.
create or replace function refund_credits(
  p_org_id uuid,
  p_generation_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved numeric;
begin
  perform 1 from organizations where id = p_org_id for update;

  if exists (
    select 1 from credit_transactions
     where generation_id = p_generation_id and type in ('refund', 'consumption')
  ) then
    return false;
  end if;

  select coalesce(sum(amount), 0) into v_reserved
    from credit_transactions
   where generation_id = p_generation_id and type = 'reservation';

  insert into credit_transactions (org_id, generation_id, amount, type)
  values (p_org_id, p_generation_id, -v_reserved, 'refund');

  update credit_grants g set used = g.used - cu.credits
    from credit_grant_uses cu
   where cu.grant_id = g.id and cu.generation_id = p_generation_id;

  delete from credit_grant_uses where generation_id = p_generation_id;

  return true;
end;
$$;

-- The agency's open grants, first-ending first, for the billing screens.
create or replace function credit_balance(p_org_id uuid)
returns table (
  grant_id uuid,
  kind text,
  credits numeric,
  used numeric,
  left_credits numeric,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.kind, g.credits, g.used, greatest(g.credits - g.used, 0), g.ends_at
    from credit_grants g
   where g.org_id = p_org_id and g.starts_at <= now() and g.ends_at > now()
   order by g.ends_at, g.created_at;
$$;

revoke all on function reserve_credits_v2(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function reserve_credits_v2(uuid, uuid, numeric) to service_role;
revoke all on function settle_credits(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function settle_credits(uuid, uuid, numeric) to service_role;
revoke all on function refund_credits(uuid, uuid) from public, anon, authenticated;
grant execute on function refund_credits(uuid, uuid) to service_role;
revoke all on function credit_balance(uuid) from public, anon, authenticated;
grant execute on function credit_balance(uuid) to service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/billing/migration-0067.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0091_credit_grants.sql src/lib/billing/migration-0067.test.ts
git commit -m "feat(billing): credit grants that end, used first-ending first (migration 0091)"
```

### Task 2: Ledger helpers call the new functions

**Files:**
- Create: `src/lib/billing/grants.ts`
- Create: `src/lib/db/credit-grants.ts`
- Modify: `src/lib/db/credit-transactions.ts` (`reserveCredits`, `settleGeneration`, `refundReservation`; remove `getReservedAmount`, `alreadySettled`)
- Test: `src/lib/db/__tests__/credit-transactions.test.ts`, `src/lib/db/__tests__/credit-grants.test.ts`

**Interfaces:**
- Consumes: the SQL functions from Task 1.
- Produces:
  - `src/lib/billing/grants.ts`: `type GrantKind = "free" | "plan" | "topup" | "admin"`, `const CREDIT_REFUSALS = ["limit", "used_up", "free_ended", "no_credits"] as const`, `type CreditRefusal`, `isCreditRefusal(v: unknown): v is CreditRefusal`, `type OpenGrant = { id: string; kind: GrantKind; credits: number; used: number; left: number; endsAt: string }`.
  - `reserveCredits(orgId, generationId, amount): Promise<{ ok: true } | { ok: false; reason: CreditRefusal }>`
  - `settleGeneration({ orgId, generationId, actualAmount }): Promise<void>` and `refundReservation({ orgId, generationId }): Promise<void>` (unchanged signatures).
  - `listOpenGrants(orgId: string): Promise<OpenGrant[]>`

- [ ] **Step 1: Write the failing tests**

`src/lib/db/__tests__/credit-transactions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc: m.rpc }) }));

import { reserveCredits, settleGeneration, refundReservation } from "../credit-transactions";

beforeEach(() => m.rpc.mockReset());

describe("reserveCredits", () => {
  it("holds through reserve_credits_v2", async () => {
    m.rpc.mockResolvedValue({ data: "ok", error: null });
    await expect(reserveCredits("org", "gen", 300)).resolves.toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("reserve_credits_v2", { p_org_id: "org", p_generation_id: "gen", p_amount: 300 });
  });

  it.each(["limit", "used_up", "free_ended", "no_credits"])("passes on the reason %s", async (reason) => {
    m.rpc.mockResolvedValue({ data: reason, error: null });
    await expect(reserveCredits("org", "gen", 300)).resolves.toEqual({ ok: false, reason });
  });

  it("throws on an answer it doesn't know rather than letting the run through", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    await expect(reserveCredits("org", "gen", 300)).rejects.toThrow("reserve_credits_v2");
  });

  it("throws a database error", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(reserveCredits("org", "gen", 300)).rejects.toThrow("down");
  });
});

describe("settleGeneration and refundReservation", () => {
  it("settles through settle_credits", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    await settleGeneration({ orgId: "org", generationId: "gen", actualAmount: 250 });
    expect(m.rpc).toHaveBeenCalledWith("settle_credits", { p_org_id: "org", p_generation_id: "gen", p_actual: 250 });
  });

  it("treats a repeat settle (false) as done", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    await expect(settleGeneration({ orgId: "org", generationId: "gen", actualAmount: 250 })).resolves.toBeUndefined();
  });

  it("refunds through refund_credits", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    await refundReservation({ orgId: "org", generationId: "gen" });
    expect(m.rpc).toHaveBeenCalledWith("refund_credits", { p_org_id: "org", p_generation_id: "gen" });
  });

  it("throws a database error on either", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(settleGeneration({ orgId: "o", generationId: "g", actualAmount: 1 })).rejects.toThrow("down");
    await expect(refundReservation({ orgId: "o", generationId: "g" })).rejects.toThrow("down");
  });
});
```

`src/lib/db/__tests__/credit-grants.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc: m.rpc }) }));

import { listOpenGrants } from "../credit-grants";

describe("listOpenGrants", () => {
  it("reads credit_balance and turns numeric strings into numbers", async () => {
    m.rpc.mockResolvedValue({
      data: [{ grant_id: "g1", kind: "free", credits: "50000", used: "1200.5", left_credits: "48799.5", ends_at: "2026-12-03T00:00:00Z" }],
      error: null,
    });
    await expect(listOpenGrants("org")).resolves.toEqual([
      { id: "g1", kind: "free", credits: 50000, used: 1200.5, left: 48799.5, endsAt: "2026-12-03T00:00:00Z" },
    ]);
    expect(m.rpc).toHaveBeenCalledWith("credit_balance", { p_org_id: "org" });
  });

  it("throws a database error", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(listOpenGrants("org")).rejects.toThrow("down");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/db/__tests__/credit-transactions.test.ts src/lib/db/__tests__/credit-grants.test.ts`
Expected: FAIL (old `reserve_credits` call; `../credit-grants` not found).

- [ ] **Step 3: Implement**

`src/lib/billing/grants.ts`:

```ts
/** What a paying agency's credits come from (credit_grants.kind, migration 0091). */
export type GrantKind = "free" | "plan" | "topup" | "admin";

/** Why reserve_credits_v2 refused a run. `limit` is a managed agency's monthly limit. */
export const CREDIT_REFUSALS = ["limit", "used_up", "free_ended", "no_credits"] as const;
export type CreditRefusal = (typeof CREDIT_REFUSALS)[number];

export function isCreditRefusal(v: unknown): v is CreditRefusal {
  return (CREDIT_REFUSALS as readonly unknown[]).includes(v);
}

/** A grant that has started and not ended, as the billing screens show it. */
export type OpenGrant = {
  id: string;
  kind: GrantKind;
  credits: number;
  used: number;
  left: number;
  endsAt: string;
};
```

`src/lib/db/credit-grants.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GrantKind, OpenGrant } from "@/lib/billing/grants";

type BalanceRow = {
  grant_id: string;
  kind: GrantKind;
  credits: number | string;
  used: number | string;
  left_credits: number | string;
  ends_at: string;
};

// The agency's open grants, first-ending first (credit_balance, migration 0091). Postgres numeric
// can arrive as a string, so each amount is turned into a number here.
export async function listOpenGrants(orgId: string): Promise<OpenGrant[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("credit_balance", { p_org_id: orgId });
  if (error) throw error;
  return ((data ?? []) as BalanceRow[]).map((r) => ({
    id: r.grant_id,
    kind: r.kind,
    credits: Number(r.credits),
    used: Number(r.used),
    left: Number(r.left_credits),
    endsAt: r.ends_at,
  }));
}
```

In `src/lib/db/credit-transactions.ts`, replace `reserveCredits`, delete `getReservedAmount` and `alreadySettled`, and replace `settleGeneration` and `refundReservation` (leave `CreditLimitError` and `getReservationAmounts` as they are):

```ts
import { isCreditRefusal, type CreditRefusal } from "@/lib/billing/grants";

// Row-locked check-and-hold via reserve_credits_v2 (migration 0091). A managed agency is checked
// against its monthly limit as before; a paying agency's hold is taken from its grants, the one
// ending first, first. Refusals come back with the reason (never thrown); an answer the code
// doesn't know throws, so a mismatch between code and database never lets a run through.
export async function reserveCredits(
  orgId: string,
  generationId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; reason: CreditRefusal }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("reserve_credits_v2", {
    p_org_id: orgId,
    p_generation_id: generationId,
    p_amount: amount,
  });
  if (error) throw error;
  if (data === "ok") return { ok: true };
  if (isCreditRefusal(data)) return { ok: false, reason: data };
  throw new Error(`reserve_credits_v2 answered ${JSON.stringify(data)}`);
}

// Success terminal state (design spec §4): refund the hold and record the real cost, and move the
// cost onto the grants the run held — one transaction in settle_credits (migration 0091). A
// repeat call changes nothing, so a route's catch-block cleanup after settling is safe. Call this
// and succeedGeneration's creditsCharged with the SAME actualAmount value.
export async function settleGeneration(input: {
  orgId: string;
  generationId: string;
  actualAmount: number;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("settle_credits", {
    p_org_id: input.orgId,
    p_generation_id: input.generationId,
    p_actual: input.actualAmount,
  });
  if (error) throw error;
}

// Failure/cancel terminal state: refund the hold and give its credits back to their grants
// (refund_credits, migration 0091). A repeat call changes nothing.
export async function refundReservation(input: {
  orgId: string;
  generationId: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("refund_credits", {
    p_org_id: input.orgId,
    p_generation_id: input.generationId,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Run tests, the type check and the ledger's callers**

Run: `npx vitest run src/lib/db/__tests__/credit-transactions.test.ts src/lib/db/__tests__/credit-grants.test.ts src/lib/generations src/lib/image-gen src/lib/api src/app/api/nodes`
Expected: PASS.
Run: `npx tsc --noEmit -p .`
Expected: no errors. A caller that narrowed `reserveCredits`' old `{ ok: boolean }` type may need `if (!r.ok)` instead of a boolean compare; fix any such caller.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/grants.ts src/lib/db/credit-grants.ts src/lib/db/credit-transactions.ts src/lib/db/__tests__/credit-transactions.test.ts src/lib/db/__tests__/credit-grants.test.ts
git commit -m "feat(billing): holds and settlements go through the grant-aware ledger functions"
```

### Task 3: Docs

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7: append D574)
- Modify: `docs/database-schema.md` (0091 tables, columns, functions)
- Modify: `docs/auth-production-migration.md` (0091: apply before the release; the staging checks)

- [ ] **Step 1: Append D574** after D573, in the log's format:

```markdown
### D574 — A paying agency's credits are grants that end, used first-ending first *(recorded 2026-11-20; refines D573; originated → `2026-11-20-credit-grants-design.md`)*

**Decision.** Every credit a paying agency receives is a grant with an end date (free, plan, top-up, admin). A run's hold is taken from the grant ending first and settling moves the real cost onto the same grants (`reserve_credits_v2`, `settle_credits`, `refund_credits`, migration 0091). Managed agencies have no grants and keep the monthly limit.
**Why.** Free credits end on their own date, so one balance per period (the first phase-1 draft) no longer says what is lost when credits end.
**Rejected.** One balance per period (wrong once free credits end on another date); working out each grant's share from the ledger on every hold (slow and hard to check); a nightly job that expires credits (an ended grant simply stops counting).
```

- [ ] **Step 2: Add 0091 to `docs/database-schema.md` and `docs/auth-production-migration.md`**, following each file's existing entries for 0090 (same headings and level of detail): the two `organizations` columns, the three tables, the four functions, and in the migration doc: apply on staging, run the spec's seven checks with a test agency, then production before the release.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(billing): D574 credit grants; 0091 in the schema and migration docs"
```
