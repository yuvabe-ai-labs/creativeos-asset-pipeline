import "server-only";
import { runBilledImageGeneration } from "@/lib/image-gen/billed-run";
import { uploadScriptPanel } from "@/lib/storage";
import { extForContentType } from "@/lib/storage/paths";
import { PANEL_MODEL_ID } from "./constants";
import { HOUSE_STYLE_REF } from "./house-style";

// D337, D345 — one storyboard panel, owned by its script and billed like any image.
export async function runPanelGeneration(args: {
  clientId: string;
  scriptId: string;
  shotId: string;
  orgId: string;
  userId: string;
  userEmail: string | null;
  aspect: string;
  prompt: string;
  referenceUrls: string[];
  /** Chosen under Advanced; GPT Image 2 when absent. */
  modelId?: string;
}) {
  return runBilledImageGeneration({
    owner: { scriptId: args.scriptId },
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    modelId: args.modelId ?? PANEL_MODEL_ID,
    aspect: args.aspect,
    prompt: args.prompt,
    // The house style image last, matching the prompt's "Reference image N shows the drawing style".
    referenceUrls: [...args.referenceUrls, HOUSE_STYLE_REF.dataUrl],
    inputsSnapshot: {
      slot: "panel", shotId: args.shotId, prompt: args.prompt,
      referenceUrls: [...args.referenceUrls, HOUSE_STYLE_REF.id],
    },
    store: (body, mimeType) =>
      uploadScriptPanel({
        clientId: args.clientId, scriptId: args.scriptId, shotId: args.shotId,
        ext: extForContentType(mimeType), body, contentType: mimeType,
      }),
  });
}
