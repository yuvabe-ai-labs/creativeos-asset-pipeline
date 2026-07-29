import { describe, it, expect } from "vitest";
import { mapClientWithCount, type RawClientWithCanvases } from "./client-with-count";

const base: RawClientWithCanvases = {
  id: "cl1",
  org_id: "org-1",
  slug: "acme",
  name: "Acme",
  logo_url: null,
  website_url: null,
  kb_status: "pending",
  active_kb_version_id: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  archived_at: null,
  drive_root_folder_id: null,
  canvases: [
    { updated_at: "2026-06-10T00:00:00Z" },
    { updated_at: "2026-06-14T00:00:00Z" },
  ],
};

describe("mapClientWithCount", () => {
  it("counts canvases and takes the latest updated_at as last_active", () => {
    const out = mapClientWithCount(base);
    expect(out.canvas_count).toBe(2);
    expect(out.last_active).toBe("2026-06-14T00:00:00Z");
  });

  it("returns count 0 and null last_active when there are no canvases", () => {
    const out = mapClientWithCount({ ...base, canvases: [] });
    expect(out.canvas_count).toBe(0);
    expect(out.last_active).toBeNull();
  });

  it("tolerates a null canvases relation", () => {
    const out = mapClientWithCount({ ...base, canvases: null });
    expect(out.canvas_count).toBe(0);
    expect(out.last_active).toBeNull();
  });

  it("preserves the client fields and drops the nested canvases array", () => {
    const out = mapClientWithCount(base);
    expect(out.slug).toBe("acme");
    expect(out.archived_at).toBeNull();
    expect("canvases" in out).toBe(false);
  });
});
