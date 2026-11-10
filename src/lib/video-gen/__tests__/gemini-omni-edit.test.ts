import { describe, it, expect } from "vitest";
import { buildOmniEditRequestBody, omniRefusalMessage } from "../providers/gemini-omni";
import { VIDEO_EDIT_REFUSED_MESSAGE } from "@/lib/video-edit/record";

describe("buildOmniEditRequestBody", () => {
  const body = buildOmniEditRequestBody({
    text: "Make the flour beige.",
    videoPart: { data: "VID", mime_type: "video/mp4" },
    imageParts: [{ type: "image", data: "IMG0", mime_type: "image/jpeg" }],
    resolution: "1080p",
  });

  it("sends text, then the video, then the references, in that order", () => {
    expect(body.input).toEqual([
      { type: "text", text: "Make the flour beige." },
      { type: "video", data: "VID", mime_type: "video/mp4" },
      { type: "image", data: "IMG0", mime_type: "image/jpeg" },
    ]);
  });

  it("asks for an edit and sends no duration or aspect ratio (the API rejects them)", () => {
    expect(body.generation_config).toEqual({ video_config: { task: "edit" } });
    expect(body.response_format).toEqual({ type: "video", resolution: "1080p", delivery: "uri" });
    expect(body.store).toBe(true);
    expect(body.background).toBe(false);
  });

  it("falls back to 720p for an unknown resolution", () => {
    const b = buildOmniEditRequestBody({ text: "x", videoPart: { data: "V", mime_type: "video/mp4" }, imageParts: [], resolution: "8k" });
    expect((b.response_format as { resolution: string }).resolution).toBe("720p");
  });
});

describe("omniRefusalMessage", () => {
  it("maps a policy refusal to the plain message", () => {
    expect(omniRefusalMessage('{"error":{"message":"Request blocked: inputs containing photorealistic children"}}')).toBe(VIDEO_EDIT_REFUSED_MESSAGE);
    expect(omniRefusalMessage("The request was blocked by safety filters")).toBe(VIDEO_EDIT_REFUSED_MESSAGE);
    expect(omniRefusalMessage("violates our usage policy")).toBe(VIDEO_EDIT_REFUSED_MESSAGE);
  });
  it("leaves other failures alone", () => {
    expect(omniRefusalMessage("Internal error (500)")).toBeNull();
  });
});
