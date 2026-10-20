"use client";
// Plays the reel through ONE <video> by swapping its source at each cut (expect a brief hitch at
// cuts between different files), ported from the rough-cut spike. While playing, the clock
// follows the video's own currentTime, so the preview never runs ahead of buffered media.
//
// Added for the product (spec §6): the preview plays the CHOSEN picture and sound. When a piece's
// sound comes from another file (a dub, or the original under a lip-synced picture), the video is
// muted and a second <audio> plays that sound, re-seeked whenever it drifts from the clock.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { locate, pieceSeconds, totalSeconds } from "@/lib/editor/timeline";
import type { PieceMedia } from "@/lib/editor/playback";
import type { Piece } from "@/lib/editor/types";

const SEEK_TOLERANCE_SECONDS = 0.12;

export function useReelPlayback(pieces: Piece[], media: (p: Piece) => PieceMedia | null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef(0);
  const piecesRef = useRef(pieces);
  const mediaRef = useRef(media);
  const tickRef = useRef<() => void>(() => {});
  const total = useMemo(() => totalSeconds(pieces), [pieces]);

  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    videoRef.current?.pause();
    audioRef.current?.pause();
  }, []);

  /** Points one element at a file and time, playing or paused to match the clock. */
  const point = useCallback((el: HTMLMediaElement, url: string, target: number) => {
    const apply = () => {
      if (Math.abs(el.currentTime - target) > SEEK_TOLERANCE_SECONDS) el.currentTime = target;
      if (playingRef.current && el.paused) el.play().catch(() => {});
      if (!playingRef.current && !el.paused) el.pause();
    };
    if (el.dataset.src !== url) {
      el.dataset.src = url;
      el.src = url;
      el.addEventListener("loadedmetadata", apply, { once: true });
    } else if (el.readyState >= 1) {
      apply();
    }
  }, []);

  // Point the picture (and the separate sound, if any) at whatever is under the playhead.
  const sync = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    const at = locate(piecesRef.current, timeRef.current);
    const m = at ? mediaRef.current(piecesRef.current[at.index]) : null;
    if (!at || !m) {
      v.pause();
      a?.pause();
      return;
    }
    const target = piecesRef.current[at.index].in + at.local;
    v.muted = m.muteVideo;
    point(v, m.pictureUrl, target);
    if (a) {
      if (m.soundUrl) point(a, m.soundUrl, target);
      else a.pause();
    }
  }, [point]);

  useEffect(() => {
    tickRef.current = () => {
      if (!playingRef.current) return;
      const ps = piecesRef.current;
      const v = videoRef.current;
      const at = locate(ps, timeRef.current);
      const m = at ? mediaRef.current(ps[at.index]) : null;
      if (!at || !v || !m) return stop();
      const piece = ps[at.index];
      const d = pieceSeconds(piece);
      let next = timeRef.current; // waiting for media: hold the clock
      if (v.dataset.src === m.pictureUrl && v.readyState >= 2 && !v.seeking) {
        const local = v.currentTime - piece.in;
        next = v.ended ? at.offset + d : at.offset + Math.min(d, Math.max(at.local, local));
      }
      const end = totalSeconds(ps);
      if (next >= end) {
        timeRef.current = end;
        setTime(end);
        return stop();
      }
      timeRef.current = next;
      setTime(next);
      sync();
      rafRef.current = requestAnimationFrame(() => tickRef.current());
    };
  }, [stop, sync]);

  // Edits (trim, split, reorder, delete, picture/sound choice) re-point the preview and keep the
  // playhead in range.
  useEffect(() => {
    piecesRef.current = pieces;
    mediaRef.current = media;
    const end = totalSeconds(pieces);
    if (timeRef.current > end) {
      timeRef.current = end;
      setTime(end);
    }
    sync();
  }, [pieces, media, sync]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const play = useCallback(() => {
    if (!piecesRef.current.length) return;
    if (timeRef.current >= totalSeconds(piecesRef.current) - 0.001) {
      timeRef.current = 0;
      setTime(0);
    }
    playingRef.current = true;
    setPlaying(true);
    sync();
    rafRef.current = requestAnimationFrame(() => tickRef.current());
  }, [sync]);

  /** `nextPieces`: an edit that hasn't rendered yet, so the preview shows the edited frame now. */
  const seek = useCallback(
    (t: number, nextPieces?: Piece[]) => {
      if (nextPieces) piecesRef.current = nextPieces;
      const end = totalSeconds(piecesRef.current);
      timeRef.current = Math.min(Math.max(0, t), end);
      setTime(timeRef.current);
      sync();
    },
    [sync],
  );

  return { videoRef, audioRef, time, playing, total, play, pause: stop, seek };
}

export type ReelPlayback = ReturnType<typeof useReelPlayback>;
