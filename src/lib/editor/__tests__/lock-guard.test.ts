import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/generation-lock", () => ({ getEditorGenerationLock: vi.fn() }));
vi.mock("@/lib/db/canvas-lock", () => ({ getCanvasLockHolder: vi.fn() }));

import { getCanvasLockHolder } from "@/lib/db/canvas-lock";
import { getEditorGenerationLock } from "@/lib/db/generation-lock";
import { editorLockResponse } from "../lock-guard";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEditorGenerationLock).mockResolvedValue("editor");
  vi.mocked(getCanvasLockHolder).mockResolvedValue("sess-1");
});

describe("editorLockResponse (D390, D408)", () => {
  it("refuses a node that feeds the Editor", async () => {
    expect((await editorLockResponse("n"))?.status).toBe(409);
  });

  it("lets the open editor itself start one: its session holds the canvas lock", async () => {
    expect(await editorLockResponse("n", { canvasId: "cv", sessionId: "sess-1" })).toBeNull();
    expect(getCanvasLockHolder).toHaveBeenCalledWith("cv");
  });

  it("still refuses any other session", async () => {
    expect((await editorLockResponse("n", { canvasId: "cv", sessionId: "other" }))?.status).toBe(409);
  });

  it("needs no check for a node that doesn't feed the Editor", async () => {
    vi.mocked(getEditorGenerationLock).mockResolvedValue(null);
    expect(await editorLockResponse("n", { canvasId: "cv", sessionId: "x" })).toBeNull();
    expect(getCanvasLockHolder).not.toHaveBeenCalled();
  });
});
