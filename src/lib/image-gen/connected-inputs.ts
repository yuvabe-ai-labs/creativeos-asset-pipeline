import { avatarSheetId } from "@/lib/video-gen/select-references";

// The Image Gen focus view's connected inputs, as the Prompt node's are: the rail LIST is the
// canvas's (what is wired in, and into its Prompt), and every preview's CONTENT is the server's
// compile-preview answer, matched by node id. Rows only the server knows (the shot's presenter, a
// script's products and locations) are not on the rail and are left out. Pure, so the merge is
// tested on its own.

/** Where a rail row's preview comes from: the server; the canvas, standing in while the server's
 *  answer is loading, failed, or predates this input; or, for an avatar (whose picture only the
 *  server has), still loading, failed, or resolved without a picture. */
export type ConnectedPreviewState = "server" | "placeholder" | "loading" | "error" | "missing";

/** One row of the compile-preview answer. */
export type ServerInput = {
  nodeId: string;
  label: string;
  text: string;
  fileUrl?: string;
  fileKind?: string;
};

type CanvasRow = {
  id: string;
  type: string;
  label?: string;
  text?: string;
  fileUrl?: string;
  fileKind?: string;
};

export type ResolvedInput<T extends CanvasRow> = T & {
  label?: string;
  text?: string;
  previewState: ConnectedPreviewState;
};

export type CompileRead = {
  status: "pending" | "error" | "success";
  rows?: readonly ServerInput[];
  /** The rows are the previous answer while a fresh read (after a rewire) is on its way: an input
   *  missing from them is still loading, not missing. */
  refreshing?: boolean;
};

export function resolveConnectedInputs<T extends CanvasRow>(
  wired: readonly T[],
  read: CompileRead,
): {
  /** One row per wired node, in the canvas's order — the rail. */
  rail: ResolvedInput<T>[];
  /** The inputs as the references, the count and the @-mention box read them: a wired avatar is
   *  its front, then its fresh sheet; an avatar with no picture is not among them. */
  images: ResolvedInput<T>[];
} {
  const byId = new Map(
    (read.status === "success" ? read.rows ?? [] : []).map((r) => [r.nodeId, r]),
  );
  const rail: ResolvedInput<T>[] = [];
  const images: ResolvedInput<T>[] = [];
  for (const u of wired) {
    const own = byId.get(u.id);
    if (own) {
      // The canvas row keeps its type, label and image metadata; the content is the server's.
      const fromServer = (r: ServerInput, label: string | undefined): ResolvedInput<T> => ({
        ...u,
        id: r.nodeId,
        label,
        text: r.text,
        fileUrl: r.fileUrl,
        fileKind: r.fileKind,
        previewState: "server",
      });
      const main = fromServer(own, u.label);
      rail.push(main);
      images.push(main);
      const sheet = u.type === "avatar" ? byId.get(avatarSheetId(u.id)) : undefined;
      if (sheet) images.push(fromServer(sheet, sheet.label));
      continue;
    }
    if (u.type === "avatar") {
      const previewState =
        read.status === "pending" || read.refreshing
          ? "loading"
          : read.status === "error"
            ? "error"
            : "missing";
      rail.push({ ...u, previewState });
      continue;
    }
    const placeholder: ResolvedInput<T> = { ...u, previewState: "placeholder" };
    rail.push(placeholder);
    images.push(placeholder);
  }
  return { rail, images };
}
