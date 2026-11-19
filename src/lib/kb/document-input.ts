import "server-only";
import type { ClientKBDocumentRow } from "@/lib/db/types";

// Turns brand documents into the model's input: PDF, Word and PowerPoint by address, Markdown and
// text read in as text. Moved out of the old re-extract route, unchanged.

const TEXT_EXTENSIONS = new Set(["md", "txt"]);
const FILE_EXTENSIONS = new Set(["pdf", "docx", "pptx"]);

/** Throws when a text document cannot be fetched: a missing document is never read as empty. */
export async function documentInput(docs: Pick<ClientKBDocumentRow, "filename" | "file_ext" | "storage_url">[]): Promise<unknown[]> {
  const content: unknown[] = [];
  for (const doc of docs) {
    if (FILE_EXTENSIONS.has(doc.file_ext)) {
      // Named first: the model can only say which document a value came from if it is told.
      content.push({ type: "input_text", text: `Document: ${doc.filename}` });
      content.push({ type: "input_file", file_url: doc.storage_url });
    } else if (TEXT_EXTENSIONS.has(doc.file_ext)) {
      const res = await fetch(doc.storage_url);
      if (!res.ok) throw new Error(`Could not fetch document: ${doc.filename}`);
      content.push({ type: "input_text", text: `${doc.filename}:\n${await res.text()}` });
    }
  }
  return content;
}
