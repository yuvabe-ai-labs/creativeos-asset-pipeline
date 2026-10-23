// Shared builders for the editor's pure-library tests.
import type { Edge } from "@xyflow/react";
import { DEFAULT_CAPTION_STYLE } from "../caption-style";
import type { EditorGraphNode } from "../shot-order";
import type { Caption, EditDoc, MediaFacts, MediaFile, SourceView } from "../types";

/** A caption; its text is its id unless given. */
export const cap = (id: string, pieceId: string, at: number, duration = 1, extra: Partial<Caption> = {}): Caption => ({ id, pieceId, at, duration, text: id, ...extra });
export const emptyDoc = (o: Partial<EditDoc> = {}): EditDoc => ({ v: 2, shape: "9:16", sources: [], pieces: [], captions: [], captionStyle: DEFAULT_CAPTION_STYLE, ...o });

export const node = (id: string, type: string, data: Record<string, unknown> = {}): EditorGraphNode => ({ id, type, data });
export const edge = (source: string, target: string, id = `${source}->${target}`): Edge => ({ id, source, target });

export const videoFacts = (o: { fps?: number; frames?: number; width?: number; height?: number } = {}): MediaFacts => {
  const fps = o.fps ?? 24;
  const frames = o.frames ?? 121;
  return {
    durationSeconds: frames / fps,
    video: { fps, frames, width: o.width ?? 720, height: o.height ?? 1280 },
    audio: { channels: 2, sampleRate: 32000 },
  };
};
export const audioFacts = (seconds: number): MediaFacts => ({ durationSeconds: seconds, video: null, audio: { channels: 2, sampleRate: 44100 } });

export const file = (url: string, facts: MediaFacts | null): MediaFile => ({ url, facts });

/** A source view; Dubbing sources get a lip-synced file and a dub unless told otherwise. */
export function source(
  nodeId: string,
  o: Partial<Omit<SourceView, "files">> & { facts?: MediaFacts | null; lipSynced?: MediaFile | null; dubAudio?: MediaFile | null } = {},
): SourceView {
  const kind = o.kind ?? "video-gen";
  return {
    nodeId,
    edgeId: o.edgeId ?? `e-${nodeId}`,
    kind,
    handle: o.handle ?? `VID-${nodeId.toUpperCase()}`,
    title: o.title ?? nodeId,
    versionId: o.versionId ?? `v-${nodeId}`,
    shotOrder: o.shotOrder === undefined ? null : o.shotOrder,
    shotLabel: o.shotLabel ?? null,
    language: o.language ?? (kind === "dubbing" ? "hi-IN" : null),
    files: {
      original: file(`https://storage.googleapis.com/b/${nodeId}.mp4`, o.facts === undefined ? videoFacts() : o.facts),
      lipSynced: o.lipSynced === undefined ? (kind === "dubbing" ? file(`https://storage.googleapis.com/b/${nodeId}-lip.mp4`, videoFacts()) : null) : o.lipSynced,
      dubAudio: o.dubAudio === undefined ? (kind === "dubbing" ? file(`https://storage.googleapis.com/b/${nodeId}-dub.wav`, audioFacts(5)) : null) : o.dubAudio,
    },
  };
}
