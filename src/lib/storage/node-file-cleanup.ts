import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { parsePathFromUrl, removeObject } from "./index";

/**
 * Delete the stored object behind a File node's `data.fileUrl` — but only when this node is
 * genuinely its sole owner.
 *
 * A File node's `fileUrl` is NOT necessarily an object this node uploaded. Picking an image
 * from the gallery or the reference picker mints a new File node pointing at the EXISTING
 * object's URL rather than copying the bytes (`use-gallery-drawer.ts`,
 * `use-reference-image-picker.ts`), so one object can back many nodes — and that URL can point
 * into another node's `files/` or even its `image-gen/` output.
 *
 * The replace/delete routes used to call `removeObject(node.data.fileUrl)` unconditionally,
 * which meant replacing the file on one node silently destroyed the bytes every other node
 * still pointed at, and could delete a generation's output. Production had 40 shared objects
 * across 119 File nodes when this was found (worst case: 12 nodes on one object), plus at
 * least one node left pointing at a 404.
 *
 * Every check fails CLOSED: when we cannot prove the object is ours alone, we keep it. An
 * orphaned object costs storage; a wrongly deleted one is unrecoverable.
 */
export type NodeFileCleanupResult =
  | { removed: true }
  | {
      removed: false;
      reason:
        | "not-our-storage" // not an object in our bucket — nothing of ours to delete
        | "not-this-nodes-file" // lives under another node, or under a generation output
        | "shared" // another node still points at this exact URL
        | "unverified"; // the reference check failed — refuse to guess
    };

export async function removeNodeFileObject(
  nodeId: string,
  fileUrl: string,
): Promise<NodeFileCleanupResult> {
  const path = parsePathFromUrl(fileUrl);
  if (path === null) return { removed: false, reason: "not-our-storage" };

  // Only ever this node's own upload slot. Generation outputs (`image-gen/`, `video-gen/`)
  // are owned by the generation, not by whatever File node happens to reference them.
  if (!path.includes(`/nodes/${nodeId}/files/`)) {
    return { removed: false, reason: "not-this-nodes-file" };
  }

  const supabase = createServerSupabase();
  const { count, error } = await supabase
    .from("nodes")
    .select("id", { count: "exact", head: true })
    .eq("data->>fileUrl", fileUrl)
    .neq("id", nodeId);

  if (error) return { removed: false, reason: "unverified" };
  if ((count ?? 0) > 0) return { removed: false, reason: "shared" };

  await removeObject(fileUrl);
  return { removed: true };
}
