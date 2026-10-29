import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/nodes", () => ({ listNodes: vi.fn() }));
vi.mock("@/lib/db/edges", () => ({ listEdges: vi.fn(), listIncomingEdges: vi.fn() }));
vi.mock("@/lib/db/editor-edits", () => ({ getEditorEdit: vi.fn() }));
vi.mock("../media-facts", () => ({ ensureMediaFacts: vi.fn() }));

import { listEdges, listIncomingEdges } from "@/lib/db/edges";
import { getEditorEdit } from "@/lib/db/editor-edits";
import { listNodes } from "@/lib/db/nodes";
import { EditUnreadableError, loadEditorState } from "../load-state";
import { ensureMediaFacts } from "../media-facts";
import { videoFacts } from "./fixtures";

const row = (id: string, type: string, output: unknown = null, version: string | null = null) => ({
  id, canvas_id: "cv", type, position: { x: 0, y: 0 }, data: {}, active_version_id: version,
  created_at: "t", updated_at: "t", active: output === null ? null : { output },
});

beforeEach(() => {
  vi.mocked(listNodes).mockResolvedValue([row("ed", "editor"), row("vg", "video-gen", "https://s/vg.mp4", "v1")] as never);
  vi.mocked(listEdges).mockResolvedValue([{ id: "e1", source: "vg", target: "ed" }]);
  vi.mocked(listIncomingEdges).mockResolvedValue([{ id: "e1", sourceNodeId: "vg", createdAt: "t1" }]);
  vi.mocked(getEditorEdit).mockResolvedValue(null);
  vi.mocked(ensureMediaFacts).mockResolvedValue(new Map([["https://s/vg.mp4", videoFacts()]]));
});

describe("loadEditorState", () => {
  it("returns null without an Editor", async () => {
    vi.mocked(listNodes).mockResolvedValue([row("vg", "video-gen")] as never);
    expect(await loadEditorState("cv")).toBeNull();
  });

  it("reconciles a first open and reports it changed", async () => {
    const state = (await loadEditorState("cv"))!;
    expect(state.editorNodeId).toBe("ed");
    expect(state.changed).toBe(true);
    expect(state.doc.pieces).toHaveLength(1);
    expect(state.sources[0]).toMatchObject({ nodeId: "vg", edgeId: "e1", versionId: "v1" });
  });

  it("reports nothing changed when the saved edit is current", async () => {
    const first = (await loadEditorState("cv"))!;
    vi.mocked(getEditorEdit).mockResolvedValue({ nodeId: "ed", doc: first.doc });
    const again = (await loadEditorState("cv"))!;
    expect(again.changed).toBe(false);
    expect(again.notices).toEqual([]);
  });

  it("throws when the stored edit is unreadable, instead of starting over", async () => {
    vi.mocked(getEditorEdit).mockResolvedValue({ nodeId: "ed", doc: { v: 99 } });
    await expect(loadEditorState("cv")).rejects.toBeInstanceOf(EditUnreadableError);
  });
});
