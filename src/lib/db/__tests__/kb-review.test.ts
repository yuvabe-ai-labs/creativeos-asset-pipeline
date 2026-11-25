import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc }) }));

import { listUnreviewedFields, patchKBFields } from "../kb";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("patchKBFields", () => {
  it("sends the patches to patch_kb_fields in one call", async () => {
    await patchKBFields("v1", [{ path: ["compliance", "disclaimers"], patch: { status: "approved" } }]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("patch_kb_fields", {
      p_version_id: "v1",
      p_patches: [{ path: ["compliance", "disclaimers"], patch: { status: "approved" } }],
      p_only_unreviewed: false,
    });
  });

  it("can be told to write only fields nobody has reviewed, and says how many it wrote", async () => {
    rpc.mockResolvedValueOnce({ data: 0, error: null });
    const applied = await patchKBFields("v1", [{ path: ["compliance", "disclaimers"], patch: { status: "approved" } }], { onlyUnreviewed: true });
    expect(applied).toBe(0);
    expect(rpc.mock.calls[0][1].p_only_unreviewed).toBe(true);
  });

  it("throws when the write fails", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(patchKBFields("v1", [{ path: ["compliance", "disclaimers"], patch: { status: "approved" } }])).rejects.toBeTruthy();
  });
});

describe("listUnreviewedFields", () => {
  it("returns the unreviewed paths", async () => {
    rpc.mockResolvedValueOnce({ data: ["target_audience.age_range"], error: null });
    expect(await listUnreviewedFields("v1")).toEqual(["target_audience.age_range"]);
    expect(rpc).toHaveBeenCalledWith("kb_unreviewed_fields", { p_version_id: "v1" });
  });

  it("throws when the read fails or the version is missing, never an empty list", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(listUnreviewedFields("v1")).rejects.toBeTruthy();
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(listUnreviewedFields("v1")).rejects.toThrow("KB version not found");
  });
});
