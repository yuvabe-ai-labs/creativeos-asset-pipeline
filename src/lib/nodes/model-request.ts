import type { UpstreamPreview } from "@/lib/nodes/resolve-inputs";
import { visionAttachmentUrls } from "@/lib/nodes/compose-message";

// The exact request a generation sent to the model — frozen provenance stored in
// node_versions.inputs_used.request (D4 envelope; D22 "written once, never edited").
export type ModelRequestRecord = {
  systemPrompt: string;         // the system message sent
  compiledUser: string;         // the assembled user text (compilePrompt.user)
  attachments: string[];        // image URLs sent as vision parts ([] if none)
  effectiveInstruction: string; // the instruction actually used (default when blank)
};

export function describeModelRequest(input: {
  system: string;
  compiledUser: string;
  effectiveInstruction: string;
  upstream: UpstreamPreview[];
}): ModelRequestRecord {
  return {
    systemPrompt: input.system,
    compiledUser: input.compiledUser,
    effectiveInstruction: input.effectiveInstruction,
    attachments: visionAttachmentUrls(input.upstream),
  };
}
