import { describe, expect, it } from "vitest";
import { traceRecorder } from "../trace/recorder";

describe("traceRecorder", () => {
  it("starts empty", () => {
    expect(traceRecorder().record()).toEqual({ sent: null, rounds: [], choice: null, refusals: [] });
  });

  it("collects what the loop and the turn report, in order", () => {
    const r = traceRecorder();
    r.sent({ system: "sys", messages: [{ role: "user", content: "hi" }], tools: [] });
    r.round({ text: "", calls: [{ id: "c1", name: "a", args: {} }], results: [{ id: "c1", output: "ok" }], ms: 5 });
    r.refused("No.");
    r.round({ text: "Done.", calls: [], results: [], ms: 3 });
    r.refused("Not that either.");
    const rec = r.record();
    expect(rec.sent?.system).toBe("sys");
    expect(rec.rounds.map((x) => x.text)).toEqual(["", "Done."]);
    expect(rec.refusals).toEqual(["No.", "Not that either."]);
  });

  it("records a choice carried out by code", () => {
    const r = traceRecorder();
    r.choice({ tool: "confirm_field", args: {}, output: "Marked Age as right." });
    expect(r.record().choice).toEqual({ tool: "confirm_field", args: {}, output: "Marked Age as right." });
  });
});
