import { describe, it, expect } from "vitest";
import { classifyWriteAction, groupIntoSessions } from "./impersonation-audit-view";

describe("classifyWriteAction", () => {
  it("treats autosaves as quiet — the flood this whole view exists to suppress", () => {
    expect(classifyWriteAction({ action: "saveCanvasAction" })).toEqual({ kind: "quiet" });
    expect(classifyWriteAction({ action: "saveCanvasNodesAction" })).toEqual({ kind: "quiet" });
  });

  it("treats upload signing handshakes and compute-only POSTs as quiet", () => {
    for (const path of [
      "/api/nodes/abc/file/sign",
      "/api/clients/abc/logo/sign",
      "/api/nodes/abc/cost",
      "/api/nodes/abc/compile-preview",
      "/api/nodes/abc/upstream-images",
    ]) {
      expect(classifyWriteAction({ method: "POST", path })).toEqual({ kind: "quiet" });
    }
  });

  it("gives known server actions a human label", () => {
    expect(classifyWriteAction({ action: "deleteCanvasAction" })).toEqual({
      kind: "action",
      label: "Deleted a canvas",
    });
    expect(classifyWriteAction({ action: "setVersionLabelAction" })).toEqual({
      kind: "action",
      label: "Labelled a version",
    });
  });

  it("extracts the node id from a generate path so it can be matched exactly", () => {
    const nodeId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(classifyWriteAction({ method: "POST", path: `/api/nodes/${nodeId}/generate` })).toEqual({
      kind: "generate",
      nodeId,
    });
    expect(
      classifyWriteAction({ method: "POST", path: `/api/nodes/${nodeId}/video-generate` }),
    ).toEqual({ kind: "generate", nodeId });
  });

  it("labels deletes by the resource they target", () => {
    expect(
      classifyWriteAction({ method: "DELETE", path: "/api/moodboards/m1/items/i1" }),
    ).toEqual({ kind: "action", label: "Deleted a moodboard item" });
    expect(
      classifyWriteAction({ method: "DELETE", path: "/api/clients/c1/kb/documents" }),
    ).toEqual({ kind: "action", label: "Deleted a knowledge-base document" });
  });

  it("labels known route families", () => {
    expect(
      classifyWriteAction({ method: "POST", path: "/api/nodes/n1/file/finalize" }),
    ).toEqual({ kind: "action", label: "Uploaded a file" });
    expect(
      classifyWriteAction({ method: "POST", path: "/api/clients/c1/kb/re-extract" }),
    ).toEqual({ kind: "action", label: "Re-ran knowledge-base extraction" });
  });

  // The audit guarantee: a route nobody mapped must still SHOW UP.
  it("falls back to a visible METHOD /path for anything unmapped", () => {
    expect(
      classifyWriteAction({ method: "PATCH", path: "/api/clients/c1/something-new" }),
    ).toEqual({ kind: "action", label: "PATCH /api/clients/c1/something-new" });
  });

  it("never throws on a malformed or missing detail", () => {
    expect(classifyWriteAction(null)).toEqual({ kind: "action", label: "Unknown action" });
    expect(classifyWriteAction({})).toEqual({ kind: "action", label: "Unknown action" });
  });

  // The DELETE branch must run BEFORE the PATH_LABELS loop. If it ever moves after,
  // this path matches /versions$ and a deletion gets mislabelled "Created a version".
  it("prefers the DELETE label over a path-family label for the same path", () => {
    expect(
      classifyWriteAction({ method: "DELETE", path: "/api/nodes/n1/versions" }),
    ).toEqual({ kind: "action", label: "Deleted a node" });
  });

  // The audit guarantee, action side: an unmapped action shows under its own name.
  it("falls back to the raw action name for an unmapped action", () => {
    expect(classifyWriteAction({ action: "someBrandNewAction" })).toEqual({
      kind: "action",
      label: "someBrandNewAction",
    });
  });

  it("names an unrecognised delete target generically rather than guessing", () => {
    expect(
      classifyWriteAction({ method: "DELETE", path: "/api/something/else" }),
    ).toEqual({ kind: "action", label: "Deleted a resource" });
  });
});

const NODE = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OP = "op-1";
const OP_B = "op-2";
const NAMES = { [OP]: "Adarsh", [OP_B]: "Priya" };

function ev(
  event_type: string,
  occurred_at: string,
  detail: Record<string, unknown> | null = null,
  operator_id = OP,
) {
  return { id: `${event_type}-${occurred_at}`, operator_id, event_type, detail, occurred_at } as never;
}

describe("groupIntoSessions", () => {
  it("groups a complete session in order and names the operator", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("elevated_mode_entered", "2026-08-11T00:14:00Z"),
        ev("write_action", "2026-08-11T00:31:00Z", { action: "deleteCanvasAction" }),
        ev("session_ended", "2026-08-11T00:48:00Z"),
      ],
      [],
      NAMES,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].operatorName).toBe("Adarsh");
    expect(sessions[0].elevated).toBe(true);
    expect(sessions[0].endedAt).toBe("2026-08-11T00:48:00Z");
    expect(sessions[0].entries.map((e) => e.kind)).toEqual(["elevated", "action"]);
  });

  it("returns an unterminated session as still active rather than dropping it", () => {
    const sessions = groupIntoSessions(
      [ev("session_started", "2026-08-11T00:12:00Z")],
      [],
      NAMES,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].endedAt).toBeNull();
  });

  it("collapses autosaves into quietCount and lists none of them", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:13:00Z", { action: "saveCanvasAction" }),
        ev("write_action", "2026-08-11T00:14:00Z", { action: "saveCanvasAction" }),
        ev("write_action", "2026-08-11T00:15:00Z", { action: "saveCanvasAction" }),
      ],
      [],
      NAMES,
    );
    expect(sessions[0].quietCount).toBe(3);
    expect(sessions[0].entries).toHaveLength(0);
  });

  it("replaces a generate row with the matching generation, by node id", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:19:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
      ],
      [
        {
          node_id: NODE,
          type: "image",
          model_used: "kling-o1",
          status: "succeeded",
          credits_consumed: 4,
          user_id: OP,
          created_at: "2026-08-11T00:19:02Z",
        },
      ],
      NAMES,
    );
    expect(sessions[0].entries).toEqual([
      {
        kind: "generation",
        at: "2026-08-11T00:19:02Z",
        genType: "image",
        model: "kling-o1",
        status: "succeeded",
        credits: 4,
      },
    ]);
  });

  // A generation that failed before its row was inserted must not vanish.
  it("keeps an unmatched generate row as an attempt", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:19:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
      ],
      [],
      NAMES,
    );
    expect(sessions[0].entries).toEqual([
      { kind: "action", at: "2026-08-11T00:19:00Z", label: "Attempted a generation" },
    ]);
  });

  it("does not claim a generation made by a different operator", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:19:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
      ],
      [
        {
          node_id: NODE,
          type: "image",
          model_used: "kling-o1",
          status: "succeeded",
          credits_consumed: 4,
          user_id: "someone-else",
          created_at: "2026-08-11T00:19:02Z",
        },
      ],
      NAMES,
    );
    expect(sessions[0].entries[0]).toMatchObject({ label: "Attempted a generation" });
  });

  it("matches two generations on the same node to their own rows, in order", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:12:00Z"),
        ev("write_action", "2026-08-11T00:19:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
        ev("write_action", "2026-08-11T00:25:00Z", {
          method: "POST",
          path: `/api/nodes/${NODE}/generate`,
        }),
      ],
      [
        { node_id: NODE, type: "image", model_used: "a", status: "succeeded",
          credits_consumed: 1, user_id: OP, created_at: "2026-08-11T00:19:02Z" },
        { node_id: NODE, type: "image", model_used: "b", status: "failed",
          credits_consumed: null, user_id: OP, created_at: "2026-08-11T00:25:03Z" },
      ],
      NAMES,
    );
    expect(sessions[0].entries.map((e) => (e as { model: string }).model)).toEqual(["a", "b"]);
  });

  it("discards events that precede the first session_started", () => {
    const sessions = groupIntoSessions(
      [
        ev("write_action", "2026-08-11T00:01:00Z", { action: "deleteCanvasAction" }),
        ev("session_started", "2026-08-11T00:12:00Z"),
      ],
      [],
      NAMES,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].entries).toHaveLength(0);
  });

  it("returns sessions newest-first", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-10T10:00:00Z"),
        ev("session_ended", "2026-08-10T10:30:00Z"),
        ev("session_started", "2026-08-11T10:00:00Z"),
      ],
      [],
      NAMES,
    );
    expect(sessions.map((s) => s.startedAt)).toEqual([
      "2026-08-11T10:00:00Z",
      "2026-08-10T10:00:00Z",
    ]);
  });

  it("tracks one open session per operator, so overlapping sessions don't cross-attribute events", () => {
    const sessions = groupIntoSessions(
      [
        ev("session_started", "2026-08-11T00:00:00Z", null, OP), // t0: A starts
        ev("session_started", "2026-08-11T00:05:00Z", null, OP_B), // t1: B starts
        ev(
          "write_action",
          "2026-08-11T00:10:00Z",
          { action: "deleteCanvasAction" },
          OP,
        ), // t2: A writes — must land on A's session, not B's
        ev("session_ended", "2026-08-11T00:15:00Z", null, OP), // t3: A ends
        ev("session_ended", "2026-08-11T00:20:00Z", null, OP_B), // t4: B ends
      ],
      [],
      NAMES,
    );

    expect(sessions).toHaveLength(2);

    const sessionA = sessions.find((s) => s.operatorId === OP)!;
    const sessionB = sessions.find((s) => s.operatorId === OP_B)!;

    expect(sessionA.entries).toEqual([
      { kind: "action", at: "2026-08-11T00:10:00Z", label: "Deleted a canvas" },
    ]);
    expect(sessionB.entries).toEqual([]);

    expect(sessionA.endedAt).toBe("2026-08-11T00:15:00Z");
    expect(sessionB.endedAt).toBe("2026-08-11T00:20:00Z");
  });

  it("falls back to a placeholder when the operator has no profile row", () => {
    const sessions = groupIntoSessions([ev("session_started", "2026-08-11T00:12:00Z")], [], {});
    expect(sessions[0].operatorName).toBe("Unknown operator");
  });
});
