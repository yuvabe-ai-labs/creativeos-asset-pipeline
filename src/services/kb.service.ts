import type { KBFieldPatch } from "@/lib/kb/field-patch";
import { readJson } from "./read-json";

const JSON_HEADERS = { "Content-Type": "application/json" };

// Writes to a client's brand KB from the browser: saving field reviews, and approving it. Each
// calls one route. No React, no caching, no toasts.
class KbService {
  /** Saves the fields the person changed, each merged into its own stored field. */
  async patchFields(clientId: string, body: { versionId: string; patches: KBFieldPatch[] }): Promise<{ ok: true }> {
    const res = await fetch(`/api/clients/${clientId}/kb/fields`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
    return readJson<{ ok: true }>(res, "Failed to save changes");
  }

  /** A person approves the brand KB. `versionId` is the KB they were looking at, when the caller has it. */
  async approve(clientId: string, versionId?: string): Promise<{ ok: true }> {
    const res = await fetch(`/api/clients/${clientId}/kb/ready`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(versionId ? { versionId } : {}),
    });
    return readJson<{ ok: true }>(res, "Failed to mark KB ready");
  }
}

export const kbService = new KbService();
