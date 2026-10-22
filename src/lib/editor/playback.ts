// What the preview plays for a piece (spec §6: the preview plays what will be exported). The
// picture is the original or lip-synced file; the sound is the original's or the dub. When the
// sound comes from another file, the video is muted and a second element plays that sound.
import type { MediaFile, Piece, SourceView } from "./types";

export type PieceMedia = { pictureUrl: string; pictureFps: number; soundUrl: string | null; muteVideo: boolean };

const FALLBACK_FPS = 24;

/** The file whose sound plays for a piece: the dub when its sound is Dubbed, else the take. */
export function pieceSoundFile(piece: Piece, source: SourceView): MediaFile {
  return piece.sound === "dubbed" && source.files.dubAudio ? source.files.dubAudio : source.files.original;
}

export function resolvePieceMedia(piece: Piece, source: SourceView): PieceMedia {
  const picture = piece.picture === "lipSynced" && source.files.lipSynced ? source.files.lipSynced : source.files.original;
  const sound = pieceSoundFile(piece, source);
  const soundUrl = sound.url === picture.url ? null : sound.url;
  return {
    pictureUrl: picture.url,
    pictureFps: picture.facts?.video?.fps ?? FALLBACK_FPS,
    soundUrl,
    muteVideo: soundUrl !== null,
  };
}
