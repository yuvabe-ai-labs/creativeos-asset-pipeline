import type { AssignedImageRoles } from "./assign-image-roles";

export type OmniUpload = { url: string; role: "first_frame" | "last_frame" | "reference" };
export type OmniTask = "text_to_video" | "image_to_video" | "reference_to_video";

export type OmniInputPlan = {
  /** Images in the exact order they are appended to the request's `input` array. */
  uploads: OmniUpload[];
  /** `[# Sources …] [# References …]` — prepended to the prompt. "" when there are no images. */
  header: string;
  /** Closing instruction naming each frame's role. "" when there are no images. */
  guidance: string;
  task: OmniTask;
};

/**
 * D207 — the sole owner of Omni's two index bases.
 *
 * The declaration header carries two simultaneous numbering schemes:
 *   `@ImageN`       — 1-based, over the WHOLE upload array
 *   `<IMAGE_REF_N>` — 0-based, over the REFERENCES SUB-ARRAY only
 * and Kling's `@image_1` next door is a third. Getting one wrong raises no error; it silently
 * binds a mention to the wrong asset, which is only visible in a generation already paid for. So
 * no prompt and no LLM ever writes this line — it is derived here from the operator's role
 * assignment, and it is unit-tested.
 *
 * The explicit declaration form is used ALWAYS, even when a single image makes the role obvious.
 * The simple inline form would be a second code path with an equally silent failure mode, and
 * "obvious" is a judgement this failure mode punishes.
 *
 * Upload order is the contract: [firstFrame?, lastFrame?, ...references].
 */
export function planOmniInput(assigned: AssignedImageRoles): OmniInputPlan {
  const uploads: OmniUpload[] = [];
  if (assigned.startFrameUrl) uploads.push({ url: assigned.startFrameUrl, role: "first_frame" });
  if (assigned.endFrameUrl) uploads.push({ url: assigned.endFrameUrl, role: "last_frame" });
  for (const url of assigned.referenceUrls) uploads.push({ url, role: "reference" });

  if (uploads.length === 0) {
    return { uploads, header: "", guidance: "", task: "text_to_video" };
  }

  const sources: string[] = [];
  const references: string[] = [];
  const guidance: string[] = [];
  let refIndex = 0; // 0-based, references only

  uploads.forEach((upload, i) => {
    const imageNo = i + 1; // 1-based, whole array
    if (upload.role === "first_frame") {
      sources.push(`<FIRST_FRAME>@Image${imageNo}`);
      guidance.push(`Use Image${imageNo} as the starting frame.`);
    } else if (upload.role === "last_frame") {
      sources.push(`<LAST_FRAME>@Image${imageNo}`);
      guidance.push(`Use Image${imageNo} as the final frame.`);
    } else {
      references.push(`<IMAGE_REF_${refIndex}>@Image${imageNo}`);
      refIndex += 1;
    }
  });

  if (references.length > 0) {
    guidance.push(
      "Use the given images as references for video generation.",
      "The images should not be used as literal initial frames.",
    );
  }

  const segments: string[] = [];
  if (sources.length > 0) segments.push(`[# Sources ${sources.join(" ")}]`);
  if (references.length > 0) segments.push(`[# References ${references.join(" ")}]`);

  return {
    uploads,
    header: segments.join(" "),
    guidance: guidance.join(" "),
    // A first frame means the model animates THAT image; references only steer it.
    task: assigned.startFrameUrl ? "image_to_video" : "reference_to_video",
  };
}
