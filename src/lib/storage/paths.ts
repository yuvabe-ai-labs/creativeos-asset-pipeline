const MAX_SLUG_LENGTH = 60;

export function sanitizeSlug(input: string): string {
  const stripped = input
    .toLowerCase()
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_.]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  return stripped || "untitled";
}

export function timestampSuffix(now = new Date()): string {
  const iso = now.toISOString();
  return iso.replace(/:/g, "-").replace(".", "-");
}

function splitName(filename: string): { stem: string; ext: string } {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return { stem: filename, ext: "" };
  return {
    stem: filename.slice(0, idx),
    ext: filename.slice(idx + 1).toLowerCase(),
  };
}

export function buildStoredName(
  filename?: string,
  override?: { slug?: string; ext?: string },
): string {
  let slug: string;
  let ext: string;
  if (override?.slug !== undefined || override?.ext !== undefined) {
    slug = override.slug ?? "output";
    ext = override.ext ?? "";
  } else if (filename) {
    const parts = splitName(filename);
    slug = sanitizeSlug(parts.stem);
    ext = parts.ext;
  } else {
    slug = "output";
    ext = "";
  }
  const base = `${slug}__${timestampSuffix()}`;
  return ext ? `${base}.${ext}` : base;
}

export function pathForNodeFile(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/files/${name}`;
}

export function pathForImageGen(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext: string;
}): string {
  const name = buildStoredName(undefined, { slug: "output", ext: args.ext });
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/image-gen/${name}`;
}

export function pathForVideoGen(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext?: string;
}): string {
  const name = buildStoredName(undefined, {
    slug: "output",
    ext: args.ext ?? "mp4",
  });
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/video-gen/${name}`;
}

export function pathForClientLogo(args: {
  clientId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/logo/${name}`;
}

export function pathForBrandImage(args: {
  clientId: string;
  imageId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/brand-images/${args.imageId}/${name}`;
}

export function pathForKBDocument(args: {
  clientId: string;
  docId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/kb-documents/${args.docId}/${name}`;
}
