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
  // Whether that run used the row's voice anchor — the with/without comparison.
  ranWithVoice: boolean;
};

// A voice anchor: audio extracted from one finished clip, sent as reference_audio for
// every later generation of the row. Held inline (small mp3 data URL), never hosted.
// `videoUrl` is the clip it came from, so that tile can show it's the row's voice.
export type RowVoice = { dataUrl: string; seconds: number; source: string; videoUrl: string };

export type FaceRow = {
  id: string;
  facePrompt: string;
  faceStatus: FaceStatus;
  faceUrl: string | null;
  faceError: string | null;
  faceAt: number | null;
  voice: RowVoice | null;
  voiceNote: string;
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
    ranWithVoice: false,
  };
}

export function newRow(facePrompt = "", voiceNote = ""): FaceRow {
  return {
    id: id(),
    facePrompt,
    faceStatus: "empty",
    faceUrl: null,
    faceError: null,
    faceAt: null,
    voice: null,
    voiceNote,
    tiles: [newTile()],
  };
}

// Regenerate never overwrites: the new face gets its own row with the same inputs —
// including the voice anchor, so "new face, same voice" is one click.
export function duplicateRow(row: FaceRow): FaceRow {
  return {
    ...newRow(row.facePrompt, row.voiceNote),
    voice: row.voice,
    tiles: row.tiles.map((t) => newTile(t.script)),
  };
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
