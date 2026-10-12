import { describe, it, expect } from "vitest";
import type { GenerationRow } from "@/lib/db/types";
import { completionEffect, isNewerJob, jobKindOf, nodeGenerationStatus } from "../node-status";

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

  it("does nothing unless the job was seen running and has now finished", () => {
    expect(completionEffect(undefined, row({ status: "succeeded" }))).toBeNull();
    expect(completionEffect(row({}), row({}))).toBeNull();
    expect(completionEffect(row({ status: "succeeded" }), row({ status: "succeeded" }))).toBeNull();
  });

  it("ignores prompt generations, which announce themselves", () => {
    expect(completionEffect(row({ type: "prompt" }), row({ type: "prompt", status: "succeeded" }))).toBeNull();
  });
});
