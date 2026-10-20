// What the preview plays for a piece (spec §6: the preview plays what will be exported). The
// picture is the original or lip-synced file; the sound is the original's or the dub. When the
// sound comes from another file, the video is muted and a second element plays that sound.
import type { Piece, SourceView } from "./types";

export type PieceMedia = { pictureUrl: string; pictureFps: number; soundUrl: string | null; muteVideo: boolean };

const FALLBACK_FPS = 24;

export function resolvePieceMedia(piece: Piece, source: SourceView): PieceMedia {
  const picture = piece.picture === "lipSynced" && source.files.lipSynced ? source.files.lipSynced : source.files.original;
  const sound = piece.sound === "dubbed" && source.files.dubAudio ? source.files.dubAudio : source.files.original;
  const soundUrl = sound.url === picture.url ? null : sound.url;
  return {
    pictureUrl: picture.url,
    pictureFps: picture.facts?.video?.fps ?? FALLBACK_FPS,
    soundUrl,
    muteVideo: soundUrl !== null,
  };
}
