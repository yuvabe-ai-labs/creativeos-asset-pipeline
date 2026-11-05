import { readJson } from "./read-json";

/** One connected input as POST /api/nodes/:id/compile-preview resolves it on the server. A wired
 *  Avatar comes back as its front (under the Avatar node's id) and its fresh sheet (`<id>:sheet`),
 *  labelled "Avatar" and "Avatar sheet". */
export type CompiledInput = {
  nodeId: string;
  label: string;
  type: string;
  text: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

export type CompilePreview = { ambient: string; connected: CompiledInput[] };

class CompilePreviewService {
  /** Throws on a failed read, so a failure is never mistaken for "nothing connected". */
  async get(nodeId: string): Promise<CompilePreview> {
    const res = await fetch(`/api/nodes/${nodeId}/compile-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await readJson<Partial<CompilePreview>>(res, "Could not load the connected inputs.");
    return { ambient: json.ambient ?? "", connected: json.connected ?? [] };
  }
}

export const compilePreviewService = new CompilePreviewService();
