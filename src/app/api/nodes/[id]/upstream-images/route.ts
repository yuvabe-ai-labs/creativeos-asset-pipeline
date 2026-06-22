import { getUpstreamOutputs } from "@/lib/db/nodes";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  try {
    const upstream = await getUpstreamOutputs(nodeId);
    const images = upstream
      .filter((u) => {
        if (u.type === "image-gen") return typeof u.activeOutput === "string";
        if (u.type === "file") {
          const d = u.data as Record<string, unknown>;
          return d.fileKind === "image" && typeof d.fileUrl === "string";
        }
        return false;
      })
      .map((u) => ({
        id: u.nodeId,
        type: u.type,
        imageUrl:
          u.type === "image-gen"
            ? (u.activeOutput as string)
            : (u.data as Record<string, unknown>).fileUrl as string,
      }));
    return apiOk({ images });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to resolve upstream images";
    return apiError(message, 500);
  }
}
