import { readJson } from "./read-json";
import type { DubLanguage, DubVoice } from "@/lib/dubbing/types";

// D379 — the Dubbing node's own reads. Starting a dub or lip sync lives in node-generation.service.
class DubbingService {
  /** A preset voice's preview sample in `language` (made once on the server, then stored). */
  async voicePreview(nodeId: string, voice: DubVoice, language: DubLanguage): Promise<{ url: string }> {
    const res = await fetch(`/api/nodes/${nodeId}/dub-voice-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice, language }),
    });
    return readJson<{ url: string }>(res, "Couldn't load the preview.");
  }
}

export const dubbingService = new DubbingService();
