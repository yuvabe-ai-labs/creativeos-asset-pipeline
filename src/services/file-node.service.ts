import type { FileNodeData } from "@/lib/canvas-nodes";
import {
  FILE_NODE_MAX_SIZE,
  FILE_NODE_TEXT_EXTENSIONS,
  FILE_NODE_IMAGE_EXTENSIONS,
} from "@/lib/nodes/file-constants";
import { uploadViaSignedUrl, readImageSize } from "@/lib/uploads/client";
import type { DrivePickedFile } from "@/hooks/use-google-picker";

type FileUploadResult = Pick<
  FileNodeData,
  "filename" | "fileExt" | "fileKind" | "fileUrl" | "rawText" | "fileSizeBytes" | "imageWidth" | "imageHeight" | "driveFileId" | "driveFileName" | "driveMimeType"
>;

type ExtractResult = { processedOutput: string };

class FileNodeService {
  async upload(nodeId: string, file: File): Promise<FileUploadResult> {
    if (file.size > FILE_NODE_MAX_SIZE) {
      throw new Error("File exceeds the 10 MB limit. Please choose a smaller file.");
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    // Text files are tiny and read server-side (rawText), so they keep using the
    // form POST. Images and documents can be up to 10 MB, which exceeds Vercel's
    // 4.5 MB function-body limit — those upload directly to GCS via a signed URL.
    if (FILE_NODE_TEXT_EXTENSIONS.has(ext)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/nodes/${nodeId}/file`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Upload failed");
      return json as FileUploadResult;
    }

    const dimensions = FILE_NODE_IMAGE_EXTENSIONS.has(ext)
      ? await readImageSize(file)
      : {};
    return uploadViaSignedUrl<FileUploadResult>(file, {
      signEndpoint: `/api/nodes/${nodeId}/file/sign`,
      finalizeEndpoint: `/api/nodes/${nodeId}/file/finalize`,
      finalizeBody: dimensions,
    });
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

  async pickFromDrive(nodeId: string, driveFile: DrivePickedFile): Promise<FileUploadResult> {
    const res = await fetch(`/api/nodes/${nodeId}/file/drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(driveFile),
    });
    const json = await res.json();
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to import file from Google Drive");
    return json as FileUploadResult;
  }
}

export const fileNodeService = new FileNodeService();
