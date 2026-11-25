// src/lib/permissions/migration-0064.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SQL is only checked by hand on staging (docs/auth-production-migration.md); this pins the
// node-files write lock-down from the schema-map review.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0064_lock_node_files_bucket.sql"), "utf8");

describe("migration 0064: node-files writes closed", () => {
  it("drops the node-files write policies that let the anon key upload and delete, and keeps public read", () => {
    expect(SQL).toContain(`drop policy if exists "Authenticated insert node-files" on storage.objects;`);
    expect(SQL).toContain(`drop policy if exists "Authenticated delete node-files" on storage.objects;`);
    // Every write is the service role's (it bypasses RLS), so no replacement write policy is made.
    expect(SQL).not.toMatch(/create policy[^;]*on storage\.objects[^;]*for (insert|update|delete|all)/i);
    // Old rows still show files by their public URL: read stays as 0004 made it.
    expect(SQL).not.toContain(`drop policy if exists "Public read node-files"`);
    expect(SQL).not.toMatch(/update storage\.buckets/);
  });

});
