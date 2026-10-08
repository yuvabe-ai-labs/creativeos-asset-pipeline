// Spec 3 — Visualise's own records, kept beside the script (D337). Pure types.

/** For each cast member on screen when a panel was drawn: whose avatar, and its face then. */
export type PanelFaces = Record<string, { avatarId: string; faceKey: string }>;

export type PanelTake = {
  id: string;
  scriptId: string;
  shotId: string;
  status: "running" | "succeeded" | "failed";
  url: string | null;
  width: number | null;
  height: number | null;
  /** D344 — the exact prompt sent. */
  prompt: string;
  /** A person wrote this prompt in the prompt box, rather than the script building it. */
  promptEdited: boolean;
  /** D343 — what the panel was drawn from; a mismatch with today's means Out of date. */
  shotKey: string;
  faces: PanelFaces;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
