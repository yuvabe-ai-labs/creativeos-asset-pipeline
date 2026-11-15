// Adding a brand KB source from the browser: the one check and the one upload, shared by the
// Brand KB form and the copilot's chat, so a file is accepted or refused the same way in both.
// Do NOT import "server-only": this runs in the browser. The server checks everything again.

import type { ClientBrandImageRow, ClientKBDocumentRow } from "@/lib/db/types";
import type { Attachment } from "@/lib/journey/thread/schema";
import { uploadViaSignedUrl } from "@/lib/uploads/client";
import {
  DOC_EXTENSIONS, IMG_EXTENSIONS, KB_DOC_PER_FILE_LIMIT_BYTES, KB_DOC_SIZE_LIMIT_BYTES, KB_IMG_SIZE_LIMIT_BYTES,
} from "./constants";
import { formatBytes } from "./utils";

export type SourceKind = "document" | "image";

/** What a file picker for brand KB sources accepts. */
export const SOURCE_ACCEPT = [...DOC_EXTENSIONS, ...IMG_EXTENSIONS].map((ext) => `.${ext}`).join(",");

const extensionOf = (filename: string) => (filename.includes(".") ? (filename.split(".").pop() ?? "").toLowerCase() : "");

export function sourceKindOf(filename: string): SourceKind | null {
  const ext = extensionOf(filename);
  if (DOC_EXTENSIONS.has(ext)) return "document";
  if (IMG_EXTENSIONS.has(ext)) return "image";
  return null;
}

const TOTAL_LIMIT: Record<SourceKind, number> = { document: KB_DOC_SIZE_LIMIT_BYTES, image: KB_IMG_SIZE_LIMIT_BYTES };

/** Null when the file may be uploaded; otherwise the reason, ready to show. `usedBytes` is what the
 *  client already holds of each kind; without it the totals are left to the server. */
export function checkSourceFile(file: { name: string; size: number }, usedBytes?: Record<SourceKind, number>): string | null {
  const kind = sourceKindOf(file.name);
  if (!kind) {
    const ext = extensionOf(file.name);
    return `${ext ? `.${ext} files` : "Files with no extension"} are not supported. Documents: PDF, DOCX, PPTX, MD, TXT. Images: JPG, PNG, WEBP.`;
  }
  if (kind === "document" && file.size > KB_DOC_PER_FILE_LIMIT_BYTES) {
    return `${file.name} is over the ${formatBytes(KB_DOC_PER_FILE_LIMIT_BYTES)} limit for one file.`;
  }
  if (usedBytes && usedBytes[kind] + file.size > TOTAL_LIMIT[kind]) {
    return `Adding ${file.name} would pass the ${formatBytes(TOTAL_LIMIT[kind])} limit for ${kind}s.`;
  }
  return null;
}

export type UploadedSource =
  | { kind: "document"; row: ClientKBDocumentRow }
  | { kind: "image"; row: ClientBrandImageRow };

/** Uploads one file straight to storage and records it as a source of the client's brand KB. */
export async function uploadSource(clientId: string, file: File): Promise<UploadedSource> {
  const kind = sourceKindOf(file.name);
  if (!kind) throw new Error(checkSourceFile(file) ?? "This file is not supported.");
  const endpoint = `/api/clients/${clientId}/kb/${kind === "document" ? "documents" : "images"}`;
  const json = await uploadViaSignedUrl<{ document?: ClientKBDocumentRow; image?: ClientBrandImageRow }>(file, {
    signEndpoint: `${endpoint}/sign`,
    finalizeEndpoint: `${endpoint}/finalize`,
  });
  if (kind === "document" && json.document) return { kind, row: json.document };
  if (kind === "image" && json.image) return { kind, row: json.image };
  throw new Error(`Failed to upload ${file.name}`);
}

/** The same upload, as what a chat message carries. */
export async function uploadSourceFile(clientId: string, file: File): Promise<Attachment> {
  const { kind, row } = await uploadSource(clientId, file);
  return { kind, id: row.id, name: row.filename, url: kind === "image" ? row.storage_url : null };
}
