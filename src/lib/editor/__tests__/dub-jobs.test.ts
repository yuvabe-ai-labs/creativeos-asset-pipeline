import { describe, expect, it } from "vitest";
import { busyNodes, finishedJobs, type EditorDubJob } from "../dub-jobs";

const job = (nodeId: string, kind: EditorDubJob["kind"], status: EditorDubJob["status"]): EditorDubJob => ({ nodeId, kind, status, error: null });

describe("dub jobs (D406)", () => {
  it("counts running jobs and starts not reported yet as busy", () => {
    const busy = busyNodes([job("a", "dub", "running"), job("b", "dub", "succeeded")], new Map([["c", "lipsync"]]));
    expect([...busy]).toEqual([["c", "lipsync"], ["a", "dub"]]);
  });

  it("finds the jobs that finished since they were seen running", () => {
    const before = new Map<string, "dub" | "lipsync">([["a", "dub"], ["b", "lipsync"]]);
    const now = [job("a", "dub", "succeeded"), job("b", "lipsync", "running"), job("c", "dub", "failed")];
    expect(finishedJobs(before, now)).toEqual([job("a", "dub", "succeeded")]);
  });

  it("ignores an older job of another kind still on record", () => {
    // a lip sync just started on "a": the latest row is still the finished dub
    expect(finishedJobs(new Map([["a", "lipsync"]]), [job("a", "dub", "succeeded")])).toEqual([]);
  });
});
