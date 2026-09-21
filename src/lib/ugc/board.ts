// Pure board model for the UGC bench. The hook owns state; these helpers stay testable.

export type FaceStatus = "empty" | "generating" | "ready" | "rejected";
export type TileStatus = "draft" | "queued" | "generating" | "done" | "rejected";

export type ScriptTile = {
  id: string;
  script: string;
  status: TileStatus;
  videoUrl: string | null;
  error: string | null;
  startedAt: number | null;
  elapsedMs: number | null;
  // The exact script the video was made from — the tile's text may be edited afterwards.
  ranScript: string | null;
};

export type FaceRow = {
  id: string;
  facePrompt: string;
  faceStatus: FaceStatus;
  faceUrl: string | null;
  faceError: string | null;
  faceAt: number | null;
  tiles: ScriptTile[];
};

const id = () => crypto.randomUUID();

export function newTile(script = ""): ScriptTile {
  return {
    id: id(),
    script,
    status: "draft",
    videoUrl: null,
    error: null,
    startedAt: null,
    elapsedMs: null,
    ranScript: null,
  };
}

export function newRow(facePrompt = ""): FaceRow {
  return {
    id: id(),
    facePrompt,
    faceStatus: "empty",
    faceUrl: null,
    faceError: null,
    faceAt: null,
    tiles: [newTile()],
  };
}

// Regenerate never overwrites: the new face gets its own row with the same inputs.
export function duplicateRow(row: FaceRow): FaceRow {
  return { ...newRow(row.facePrompt), tiles: row.tiles.map((t) => newTile(t.script)) };
}

export function runnableTiles(rows: FaceRow[]): { rowId: string; tileId: string }[] {
  return rows.flatMap((r) =>
    r.faceStatus === "ready" && r.faceUrl
      ? r.tiles
          .filter((t) => t.status === "draft" && t.script.trim())
          .map((t) => ({ rowId: r.id, tileId: t.id }))
      : [],
  );
}
