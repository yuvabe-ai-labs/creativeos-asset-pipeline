"use client";

// UGC bench state. Session only — everything lives in this hook; nothing is saved.
// Seedance runs through a small in-browser queue (MAX_CONCURRENT) and each task is
// polled from the browser, so the page works on localhost without Trigger.dev.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultSettings,
  engineConfig,
  MAX_CONCURRENT,
  MAX_POLLS,
  POLL_MS,
  TERMINAL_STATUSES,
  type BenchSettings,
  type Engine,
} from "@/lib/ugc/constants";
import {
  duplicateRow,
  newRow,
  newTile,
  runnableTiles,
  type FaceRow,
  type ScriptTile,
} from "@/lib/ugc/board";
import { starterRows } from "@/lib/ugc/starter";
import { request, type LogEntry, type Logger } from "@/lib/ugc/request";

type Job = { rowId: string; tileId: string };

const MAX_LOG = 200;

export function useUgcBench(engine: Engine = "seedance") {
  const [rows, setRows] = useState<FaceRow[]>(starterRows);
  const [settings, setSettings] = useState<BenchSettings>(() => defaultSettings(engine));
  const [log, setLog] = useState<LogEntry[]>([]);

  // Async work reads the latest state through refs, not stale closures.
  const rowsRef = useRef(rows);
  const settingsRef = useRef(settings);
  useEffect(() => void (rowsRef.current = rows), [rows]);
  useEffect(() => void (settingsRef.current = settings), [settings]);

  const addLog: Logger = useCallback((entry) => {
    const full = { ...entry, id: crypto.randomUUID(), at: new Date().toISOString() };
    setLog((l) => [full, ...l].slice(0, MAX_LOG));
  }, []);

  // "Face 2 · Script 1" — positions as the user sees them, for readable log labels.
  const where = useCallback((rowId: string, tileId?: string) => {
    const r = rowsRef.current.findIndex((x) => x.id === rowId);
    const t = tileId ? (rowsRef.current[r]?.tiles.findIndex((x) => x.id === tileId) ?? -1) : -1;
    return `Face ${r + 1}${t >= 0 ? ` · Script ${t + 1}` : ""}`;
  }, []);

  const queue = useRef<Job[]>([]);
  const active = useRef(0);

  const patchRow = useCallback((rowId: string, patch: Partial<FaceRow>) => {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }, []);

  const patchTile = useCallback((rowId: string, tileId: string, patch: Partial<ScriptTile>) => {
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? { ...r, tiles: r.tiles.map((t) => (t.id === tileId ? { ...t, ...patch } : t)) }
          : r,
      ),
    );
  }, []);

  const generateFace = useCallback(
    async (rowId: string) => {
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row?.facePrompt.trim()) return;
      patchRow(rowId, { faceStatus: "generating", faceError: null });
      const res = await request<{ imageUrl: string | null; error: string | null }>(
        addLog,
        `${where(rowId)} · Seedream`,
        "POST",
        "/api/ugc/face",
        { prompt: row.facePrompt },
      );
      patchRow(
        rowId,
        res.ok && res.data.imageUrl
          ? { faceStatus: "ready", faceUrl: res.data.imageUrl, faceAt: Date.now() }
          : { faceStatus: "rejected", faceError: res.ok ? "No image returned" : res.error },
      );
    },
    [patchRow, addLog, where],
  );

  const regenerateFace = useCallback(
    (rowId: string) => {
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row) return;
      const copy = duplicateRow(row);
      const next = rowsRef.current.flatMap((r) => (r.id === rowId ? [r, copy] : [r]));
      rowsRef.current = next; // generateFace reads the ref before React re-renders
      setRows(next);
      void generateFace(copy.id);
    },
    [generateFace],
  );

  const execute = useCallback(
    async ({ rowId, tileId }: Job) => {
      const row = rowsRef.current.find((r) => r.id === rowId);
      const tile = row?.tiles.find((t) => t.id === tileId);
      if (!row?.faceUrl || !tile) return;

      const startedAt = Date.now();
      const fail = (error: string) =>
        patchTile(rowId, tileId, { status: "rejected", error, elapsedMs: Date.now() - startedAt });
      patchTile(rowId, tileId, {
        status: "generating",
        startedAt,
        ranScript: tile.script,
        ranWithVoice: !!row.voice && engineConfig(engine).supportsVoice,
        error: null,
      });

      // Omni is synchronous: one call returns the finished video, so there is no poll loop.
      if (engine === "omni") {
        const res = await request<{ videoUrl: string | null; error: string | null }>(
          addLog,
          `${where(rowId, tileId)} · Omni`,
          "POST",
          "/api/ugc/omni/video",
          { script: tile.script, referenceUrl: row.faceUrl, settings: settingsRef.current },
        );
        if (!res.ok || !res.data.videoUrl) {
          return fail(res.ok ? (res.data.error ?? "Omni returned no video") : res.error);
        }
        return patchTile(rowId, tileId, {
          status: "done",
          videoUrl: res.data.videoUrl,
          elapsedMs: Date.now() - startedAt,
        });
      }

      const label = `${where(rowId, tileId)} · Seedance${row.voice ? " + voice" : ""}`;
      const created = await request<{ taskId: string | null; error: string | null }>(
        addLog,
        `${label} create`,
        "POST",
        "/api/ugc/video",
        {
          script: tile.script,
          referenceUrl: row.faceUrl,
          settings: settingsRef.current,
          voice: row.voice ? { audioUrl: row.voice.dataUrl, note: row.voiceNote } : undefined,
        },
      );
      if (!created.ok || !created.data.taskId) {
        return fail(created.ok ? "Seedance returned no task id" : created.error);
      }
      const taskId = created.data.taskId;

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        type Polled = { status: string | null; videoUrl: string | null; error: string | null };
        const res = await request<Polled>(
          addLog,
          `${label} poll ${taskId}`,
          "GET",
          `/api/ugc/video/${taskId}`,
          undefined,
          { logSuccess: false }, // in-progress polls are noise; failures and the final result are logged
        );
        if (!res.ok) return fail(res.error);
        const polled = res.data;
        if (polled.status && TERMINAL_STATUSES.includes(polled.status)) {
          addLog({
            label: `${label} finished ${taskId}`,
            method: "GET",
            url: `/api/ugc/video/${taskId}`,
            ok: !!polled.videoUrl,
            httpStatus: 200,
            ms: Date.now() - startedAt,
            response: polled,
          });
          if (polled.videoUrl) {
            return patchTile(rowId, tileId, {
              status: "done",
              videoUrl: polled.videoUrl,
              elapsedMs: Date.now() - startedAt,
            });
          }
          return fail(polled.error ?? `Task ended as "${polled.status}"`);
        }
      }
      fail(`Timed out after 7.5 minutes (task ${taskId})`);
    },
    [patchTile, addLog, where, engine],
  );

  // "Use this voice": extract the audio of a finished clip and make it the row's voice
  // anchor. Returns an error message for the tile to show, or null on success.
  const takeVoiceFrom = useCallback(
    async (rowId: string, tileId: string): Promise<string | null> => {
      const tile = rowsRef.current.find((r) => r.id === rowId)?.tiles.find((t) => t.id === tileId);
      if (!tile?.videoUrl) return "This tile has no video yet";
      const source = where(rowId, tileId).replace(/^Face \d+ · /, "");
      const res = await request<{ audioDataUrl: string; seconds: number; error?: string }>(
        addLog,
        `${where(rowId, tileId)} · extract voice`,
        "POST",
        "/api/ugc/voice",
        { videoUrl: tile.videoUrl },
      );
      if (!res.ok) return res.error;
      patchRow(rowId, {
        voice: {
          dataUrl: res.data.audioDataUrl,
          seconds: res.data.seconds,
          source,
          videoUrl: tile.videoUrl,
        },
      });
      return null;
    },
    [addLog, where, patchRow],
  );

  const pump = useCallback(() => {
    // Recurse through a local function: a finished job refills its slot from the queue.
    const drain = () => {
      while (active.current < MAX_CONCURRENT && queue.current.length) {
        const job = queue.current.shift()!;
        active.current++;
        execute(job)
          .catch((e) => patchTile(job.rowId, job.tileId, { status: "rejected", error: String(e) }))
          .finally(() => {
            active.current--;
            drain();
          });
      }
    };
    drain();
  }, [execute, patchTile]);

  const enqueue = useCallback(
    (jobs: Job[]) => {
      for (const j of jobs) patchTile(j.rowId, j.tileId, { status: "queued", error: null });
      queue.current.push(...jobs);
      pump();
    },
    [patchTile, pump],
  );

  const runTile = useCallback(
    (rowId: string, tileId: string) => enqueue([{ rowId, tileId }]),
    [enqueue],
  );
  const runAll = useCallback(() => enqueue(runnableTiles(rowsRef.current)), [enqueue]);

  return {
    engine,
    rows,
    settings,
    setSettings,
    pendingCount: runnableTiles(rows).length,
    addRow: () => setRows((rs) => [...rs, newRow()]),
    removeRow: (rowId: string) => setRows((rs) => rs.filter((r) => r.id !== rowId)),
    setFacePrompt: (rowId: string, facePrompt: string) => patchRow(rowId, { facePrompt }),
    generateFace,
    regenerateFace,
    addTile: (rowId: string) =>
      setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, tiles: [...r.tiles, newTile()] } : r))),
    removeTile: (rowId: string, tileId: string) =>
      setRows((rs) =>
        rs.map((r) => (r.id === rowId ? { ...r, tiles: r.tiles.filter((t) => t.id !== tileId) } : r)),
      ),
    setScript: (rowId: string, tileId: string, script: string) =>
      patchTile(rowId, tileId, { script, status: "draft", videoUrl: null, error: null }),
    runTile,
    runAll,
    takeVoiceFrom,
    clearVoice: (rowId: string) => patchRow(rowId, { voice: null }),
    setVoiceNote: (rowId: string, voiceNote: string) => patchRow(rowId, { voiceNote }),
    log,
    clearLog: () => setLog([]),
  };
}

export type UgcBench = ReturnType<typeof useUgcBench>;
