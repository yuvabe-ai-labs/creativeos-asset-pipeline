import { describe, it, expect } from "vitest";
import type { GenerationRow } from "@/lib/db/types";
import {
  clearsStartMark,
  completionEffect,
  completionEffects,
  isNewerJob,
  jobKindOf,
  mergeJob,
  nodeGenerationStatus,
} from "../node-status";
import { CREDIT_LIMIT_MESSAGE, START_FAILED_MESSAGE } from "@/lib/image-gen/failure-copy";
import { IMAGE_RUN_MAX_AGE_MS } from "@/lib/image-gen/constants";

const row = (over: Partial<GenerationRow>): GenerationRow =>
  ({
    id: "g1",
    node_id: "n1",
    type: "image",
    status: "running",
    error: null,
    output_snapshot: null,
    created_at: "2026-10-12T10:00:00.000Z",
    ...over,
  }) as GenerationRow;

describe("jobKindOf", () => {
  it("maps the generation type to the job kind", () => {
    expect(jobKindOf("image")).toBe("image");
    expect(jobKindOf("voice")).toBe("voice");
    expect(jobKindOf("video")).toBe("video");
  });
});

describe("isNewerJob", () => {
  it("is newer when there is no current job, or it was created later", () => {
    expect(isNewerJob(row({}), undefined)).toBe(true);
    expect(isNewerJob(row({ id: "g2", created_at: "2026-10-12T10:05:00.000Z" }), row({}))).toBe(true);
    expect(isNewerJob(row({ id: "g0", created_at: "2026-10-12T09:55:00.000Z" }), row({}))).toBe(false);
  });

  it("treats an update of the same job as current", () => {
    expect(isNewerJob(row({ status: "succeeded" }), row({}))).toBe(true);
  });
});

describe("clearsStartMark", () => {
  it("a mark with an id clears on that job's row, whatever its status, and on no other", () => {
    const mark = { kind: "image" as const, generationId: "g1" };
    expect(clearsStartMark(mark, row({}), false)).toBe(true);
    expect(clearsStartMark(mark, row({ status: "succeeded" }), false)).toBe(true);
    expect(clearsStartMark(mark, row({ status: "failed" }), false)).toBe(true);
    expect(clearsStartMark(mark, row({ id: "g2" }), true)).toBe(false);
  });

  it("a mark without an id clears on any row that advances the node's latest job", () => {
    const mark = { kind: "voice" as const };
    expect(clearsStartMark(mark, row({ status: "succeeded" }), true)).toBe(true);
    expect(clearsStartMark(mark, row({}), true)).toBe(true);
    expect(clearsStartMark(mark, row({ status: "succeeded" }), false)).toBe(false);
  });
});

describe("mergeJob", () => {
  it("never lets a running row overwrite a finished one", () => {
    const done = row({ status: "succeeded" });
    expect(mergeJob(done, row({}))).toBe(done);
    const failed = row({ status: "failed" });
    expect(mergeJob(failed, row({}))).toBe(failed);
  });

  it("otherwise takes the incoming row", () => {
    const incoming = row({ status: "succeeded" });
    expect(mergeJob(undefined, incoming)).toBe(incoming);
    expect(mergeJob(row({}), incoming)).toBe(incoming);
    const running = row({});
    expect(mergeJob(row({}), running)).toBe(running);
  });
});

describe("nodeGenerationStatus", () => {
  it("is generating from the moment a start is accepted, before its row arrives", () => {
    expect(nodeGenerationStatus(undefined, "image", null)).toEqual({ isGenerating: true, kind: "image", lastError: null });
  });

  it("is generating while the latest job is running", () => {
    expect(nodeGenerationStatus(row({ type: "voice" }), undefined, null)).toEqual({
      isGenerating: true,
      kind: "voice",
      lastError: null,
    });
  });

  it("treats an image row running past the max age as stuck, not generating", () => {
    const created = Date.parse("2026-10-12T10:00:00.000Z");
    const live = nodeGenerationStatus(row({}), undefined, null, created + IMAGE_RUN_MAX_AGE_MS - 1000);
    expect(live.isGenerating).toBe(true);
    const stuck = nodeGenerationStatus(row({}), undefined, null, created + IMAGE_RUN_MAX_AGE_MS + 1000);
    expect(stuck).toEqual({ isGenerating: false, kind: null, lastError: null });
    // A video keeps its own (longer) life: the age limit is for image runs only.
    const video = nodeGenerationStatus(row({ type: "video" }), undefined, null, created + IMAGE_RUN_MAX_AGE_MS + 1000);
    expect(video.isGenerating).toBe(true);
  });

  it("shows the latest job's failure, and a failed start request ahead of it", () => {
    const failed = row({ status: "failed", error: "Content was blocked" });
    expect(nodeGenerationStatus(failed, undefined, null).lastError).toBe("Content was blocked");
    expect(nodeGenerationStatus(failed, undefined, "Couldn't start").lastError).toBe("Couldn't start");
  });

  it("is idle after a success", () => {
    expect(nodeGenerationStatus(row({ status: "succeeded" }), undefined, null)).toEqual({
      isGenerating: false,
      kind: null,
      lastError: null,
    });
  });
});

describe("completionEffect", () => {
  it("announces an image that finished, and puts it on the card", () => {
    expect(completionEffect(row({}), row({ status: "succeeded", output_snapshot: "https://cdn/g1.png" }))).toEqual({
      toast: { tone: "success", message: "Image ready" },
      cardImage: "https://cdn/g1.png",
    });
  });

  it("announces a finished video without touching the card (the video view mirrors it)", () => {
    expect(completionEffect(row({ type: "video" }), row({ type: "video", status: "succeeded" }))).toEqual({
      toast: { tone: "success", message: "Video ready" },
      cardImage: null,
    });
  });

  it("reports a failure with its reason", () => {
    expect(completionEffect(row({}), row({ status: "failed", error: "Out of credits" }))).toEqual({
      toast: { tone: "error", message: "Out of credits" },
      cardImage: null,
    });
  });

  it("stays quiet for an image start that failed in its request, which already said so", () => {
    expect(completionEffect(row({}), row({ status: "failed", error: START_FAILED_MESSAGE }))).toBeNull();
    expect(completionEffect(row({}), row({ status: "failed", error: CREDIT_LIMIT_MESSAGE }))).toBeNull();
  });

  it("does nothing unless the job was seen running and has now finished", () => {
    expect(completionEffect(undefined, row({ status: "succeeded" }))).toBeNull();
    expect(completionEffect(row({}), row({}))).toBeNull();
    expect(completionEffect(row({ status: "succeeded" }), row({ status: "succeeded" }))).toBeNull();
  });

  it("ignores prompt generations, which announce themselves", () => {
    expect(completionEffect(row({ type: "prompt" }), row({ type: "prompt", status: "succeeded" }))).toBeNull();
  });
});

describe("completionEffects", () => {
  it("yields an effect only for rows that went from running to finished", () => {
    const stored = {
      a: row({ id: "a" }),
      b: row({ id: "b" }),
      c: row({ id: "c", status: "succeeded" }),
    };
    const effects = completionEffects(stored, [
      row({ id: "a", status: "succeeded", output_snapshot: "img" }),
      row({ id: "b" }),
      row({ id: "c", status: "succeeded" }),
      row({ id: "d", status: "failed" }),
    ]);
    expect(effects).toHaveLength(1);
    expect(effects[0].row.id).toBe("a");
    expect(effects[0].effect).toEqual({ toast: { tone: "success", message: "Image ready" }, cardImage: "img" });
  });

  it("is empty on a first load, when nothing is stored", () => {
    expect(completionEffects({}, [row({ status: "succeeded" })])).toEqual([]);
  });
});

describe("dubbing kinds", () => {
  it("names dub and lipsync jobs", () => {
    expect(jobKindOf("dub")).toBe("dub");
    expect(jobKindOf("lipsync")).toBe("lipsync");
  });
  it("announces a finished dub and lip sync", () => {
    const r = (type: string, status: string, error: string | null = null) =>
      ({ id: "g", node_id: "n", type, status, error, output_snapshot: null, created_at: "2026-10-15T00:00:00Z", version_id: null }) as never;
    expect(completionEffect(r("dub", "running"), r("dub", "succeeded"))?.toast.message).toBe("Dub ready");
    expect(completionEffect(r("lipsync", "running"), r("lipsync", "succeeded"))?.toast.message).toBe("Lip sync ready");
    expect(completionEffect(r("dub", "running"), r("dub", "failed", null))?.toast.message).toBe("Dubbing failed");
  });
});
