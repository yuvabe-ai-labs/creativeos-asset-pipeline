"use client";
// Plays the reel through ONE <video> by swapping its source at each cut (expect a brief hitch at
// cuts between different files), ported from the rough-cut spike. While playing, the clock
// follows the video's own frames, so the preview never runs ahead of buffered media.
//
// D402 — an animation-frame loop drives the clock, so playback carries on through every cut. Where
// the browser has requestVideoFrameCallback, it only REPORTS the presented frame's time (and which
// file it belongs to); the loop uses that for the current file, else currentTime (D397's
// precision without its stall: the frame callback never fires on an ended video).
//
// Added for the product (spec §6): the preview plays the CHOSEN picture and sound. When a piece's
// sound comes from another file (a dub, or the original under a lip-synced picture), the video is
// muted and a second <audio> plays that sound, re-seeked whenever it drifts from the clock.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { advanceClock } from "@/lib/editor/clock";
import { locate, pieceSeconds, totalSeconds } from "@/lib/editor/timeline";
import type { PieceMedia } from "@/lib/editor/playback";
import type { Piece } from "@/lib/editor/types";

const SEEK_TOLERANCE_SECONDS = 0.12;
const FALLBACK_FPS = 24;

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?(cb: (now: number, meta: { mediaTime: number }) => void): number;
};

export function useReelPlayback(pieces: Piece[], media: (p: Piece) => PieceMedia | null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef(0);
  /** The last frame the video presented: its file and time (D402). */
  const frameRef = useRef<{ src: string; mediaTime: number } | null>(null);
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

  const schedule = useCallback(() => {
    rafRef.current = requestAnimationFrame(() => tickRef.current());
  }, []);

  // The frame reporter: re-arms itself on every frame, and again whenever a new file starts
  // playing (a source swap or a seek can leave no callback pending).
  useEffect(() => {
    const v = videoRef.current as VideoWithFrames | null;
    if (!v?.requestVideoFrameCallback) return;
    let alive = true;
    let pending = false;
    const arm = () => {
      if (!alive || pending) return;
      pending = true;
      v.requestVideoFrameCallback!((_now, meta) => {
        pending = false;
        frameRef.current = { src: v.dataset.src ?? "", mediaTime: meta.mediaTime };
        arm();
      });
    };
    arm();
    v.addEventListener("play", arm);
    v.addEventListener("loadeddata", arm);
    return () => {
      alive = false;
      v.removeEventListener("play", arm);
      v.removeEventListener("loadeddata", arm);
    };
  }, []);

  /** Points one element at a file and time, playing or paused to match the clock. */
  const point = useCallback((el: HTMLMediaElement, url: string, target: number) => {
    const apply = () => {
      if (Math.abs(el.currentTime - target) > SEEK_TOLERANCE_SECONDS) {
        el.currentTime = target;
        frameRef.current = null; // a frame from before the seek would move the clock
      }
      if (playingRef.current && el.paused) el.play().catch(() => {});
      if (!playingRef.current && !el.paused) el.pause();
    };
    if (el.dataset.src !== url) {
      frameRef.current = null;
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
      const ready = v.dataset.src === m.pictureUrl && v.readyState >= 2 && !v.seeking;
      const frame = frameRef.current;
      const fileTime = !ready ? null : frame && frame.src === m.pictureUrl ? frame.mediaTime : v.currentTime;
      const step = advanceClock({
        offset: at.offset,
        length: pieceSeconds(piece),
        local: at.local,
        sourceIn: piece.in,
        fileTime,
        ended: ready && v.ended,
        total: totalSeconds(ps),
        fps: m.pictureFps,
      });
      if (step.done) {
        timeRef.current = step.time;
        setTime(step.time);
        return stop();
      }
      timeRef.current = step.time;
      setTime(step.time);
      sync(); // at a cut, points the video at the next piece's file and plays it
      schedule();
    };
  }, [stop, sync, schedule]);

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
    schedule();
  }, [sync, schedule]);

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

  const fpsAt = useCallback((t: number) => {
    const at = locate(piecesRef.current, t);
    return (at && mediaRef.current(piecesRef.current[at.index])?.pictureFps) || FALLBACK_FPS;
  }, []);

  /** Pauses and moves by whole frames, landing mid-frame so the browser shows that frame. */
  const step = useCallback(
    (frames: number) => {
      stop();
      const f = fpsAt(timeRef.current);
      seek((Math.round(timeRef.current * f) + frames + 0.5) / f);
    },
    [stop, seek, fpsAt],
  );

  /** The frame rate of the picture under the playhead (D397's frame rule uses it). */
  const fps = useMemo(() => {
    const at = locate(pieces, time);
    return (at && media(pieces[at.index])?.pictureFps) || FALLBACK_FPS;
  }, [pieces, media, time]);

  return { videoRef, audioRef, time, playing, total, fps, play, pause: stop, seek, step };
}

export type ReelPlayback = ReturnType<typeof useReelPlayback>;
