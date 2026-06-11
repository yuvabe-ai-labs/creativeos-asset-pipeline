import type { FileNodeData } from "@/lib/canvas-nodes";
import { FILE_NODE_MAX_SIZE } from "@/lib/nodes/file-constants";

type FileUploadResult = Pick<
  FileNodeData,
  "filename" | "fileExt" | "fileKind" | "fileUrl" | "rawText"
>;

type ExtractResult = { processedOutput: string };

class FileNodeService {
  async upload(nodeId: string, file: File): Promise<FileUploadResult> {
    if (file.size > FILE_NODE_MAX_SIZE) {
      throw new Error("File exceeds the 10 MB limit. Please choose a smaller file.");
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/nodes/${nodeId}/file`, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "Upload failed");
    return json as FileUploadResult;
  }

  async remove(nodeId: string): Promise<void> {
    const res = await fetch(`/api/nodes/${nodeId}/file`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      throw new Error((json as { error?: string }).error ?? "Remove failed");
    }
  }

  async extract(
    nodeId: string,
    llmPrompt: string,
    fileMeta: { fileKind: string; rawText?: string; fileUrl?: string },
  ): Promise<ExtractResult> {
    const res = await fetch(`/api/nodes/${nodeId}/file/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llmPrompt, ...fileMeta }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "Extraction failed");
    return json as ExtractResult;
  }
}

export const fileNodeService = new FileNodeService();
