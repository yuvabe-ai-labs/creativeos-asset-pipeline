import { createServerSupabase } from "@/lib/supabase/server";
import {
  apiError,
  apiOk,
  validateFileExtension,
  validateFileSize,
  isApiError,
  withTryCatch,
} from "@/lib/api/route-helpers";
import {
  FILE_NODE_IMAGE_EXTENSIONS,
  FILE_NODE_IMAGE_SIZE_LIMIT,
} from "@/lib/nodes/file-constants";
import { getClientBySlug } from "@/lib/db/clients";
import { getCanvasBySlug } from "@/lib/db/canvases";
import { uploadNodeFile } from "@/lib/storage";
import { parseCanvasUrl } from "@/lib/reference-clipper/canvas-url";
import { computeStaggeredPosition } from "@/lib/reference-clipper/position";

// POST /api/ingest-image — create an image File node on a canvas from the browser
// extension. Slug-based (the extension only has slugs from the canvas URL), so it
// deliberately does NOT use withClient (that helper resolves a client UUID). Open,
// like the rest of the app (D14).
export async function POST(req: Request) {
  return withTryCatch("Failed to ingest image.", async () => {
    // Read the multipart body ONCE — parseFormFile re-reads req.formData(), so it
    // isn't composable with also reading the URL fields.
    const form = await req.formData();

    const canvasUrl = form.get("canvasUrl");
    if (typeof canvasUrl !== "string") {
      return apiError("A 'canvasUrl' field is required.", 400);
    }
    const parsed = parseCanvasUrl(canvasUrl);
    if (!parsed) return apiError("Not a valid canvas URL.", 400);

    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError("A 'file' field is required.", 400);
    }

    const extResult = validateFileExtension(file, FILE_NODE_IMAGE_EXTENSIONS);
    if (isApiError(extResult)) return extResult;
    const { ext } = extResult;

    const sizeError = validateFileSize(
      file.size,
      0,
      FILE_NODE_IMAGE_SIZE_LIMIT,
      "10 MB",
    );
    if (sizeError) return sizeError;

    const client = await getClientBySlug(parsed.clientSlug);
    if (!client) return apiError("Client not found.", 404);
    const canvas = await getCanvasBySlug(client.id, parsed.canvasSlug);
    if (!canvas) return apiError("Canvas not found.", 404);

    const supabase = createServerSupabase();

    // Stagger by current node count so a batch push lands as a readable column.
    const { count } = await supabase
      .from("nodes")
      .select("id", { count: "exact", head: true })
      .eq("canvas_id", canvas.id);
    const position = computeStaggeredPosition(count ?? 0);

    const sourceUrlValue = form.get("sourceUrl");
    const sourceUrl =
      typeof sourceUrlValue === "string" ? sourceUrlValue : null;
    const nodeId = crypto.randomUUID();

    // Insert the row BEFORE upload so resolveOwnership(nodeId) can build the GCS path.
    const dataBase = {
      fileKind: "image" as const,
      filename: file.name,
      fileExt: ext,
      sourceUrl,
    };
    const { error: insertErr } = await supabase.from("nodes").insert({
      id: nodeId,
      canvas_id: canvas.id,
      type: "file",
      position,
      data: { ...dataBase, fileUrl: "" },
    });
    if (insertErr) throw insertErr;

    const { url } = await uploadNodeFile({
      nodeId,
      filename: file.name,
      body: await file.arrayBuffer(),
      contentType: file.type,
    });

    const { error: updateErr } = await supabase
      .from("nodes")
      .update({ data: { ...dataBase, fileUrl: url } })
      .eq("id", nodeId);
    if (updateErr) throw updateErr;

    return apiOk({ nodeId, fileUrl: url }, 201);
  });
}
