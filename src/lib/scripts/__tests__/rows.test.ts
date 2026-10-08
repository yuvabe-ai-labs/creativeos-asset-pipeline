import { describe, it, expect, vi } from "vitest";
import { rowToScript, type ScriptRow } from "../rows";
import reel01 from "../fixtures/reel-01.json";

const row = (overrides: Partial<ScriptRow> = {}): ScriptRow => ({
  id: "6f1c2b1e-0000-4000-8000-000000000001",
  client_id: "c1",
  stage: "approved",
  doc: reel01,
  approved_at: "2026-10-10T10:00:00.000Z",
  archived_at: null,
  created_at: "2026-10-08T10:00:00.000Z",
  updated_at: "2026-10-10T10:00:00.000Z",
  ...overrides,
});

describe("rowToScript", () => {
  it("maps a valid row", () => {
    const script = rowToScript(row());
    expect(script).toMatchObject({ id: row().id, clientId: "c1", stage: "approved", approvedAt: "2026-10-10T10:00:00.000Z" });
    expect(script?.doc.shots).toHaveLength(14);
  });

  it("returns null, and warns, for a doc that fails validation", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rowToScript(row({ doc: { header: {} } }))).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null for an unknown stage", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rowToScript(row({ stage: "shipped" }))).toBeNull();
    warn.mockRestore();
  });
});
