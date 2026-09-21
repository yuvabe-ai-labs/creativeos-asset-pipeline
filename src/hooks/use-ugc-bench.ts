"use client";

// UGC bench state. Session only — everything lives in this hook; nothing is saved.
// Seedance runs through a small in-browser queue (MAX_CONCURRENT) and each task is
// polled from the browser, so the page works on localhost without Trigger.dev.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  MAX_CONCURRENT,
  MAX_POLLS,
  POLL_MS,
  TERMINAL_STATUSES,
  type BenchSettings,
} from "@/lib/ugc/constants";
import {
  duplicateRow,
  newRow,
  newTile,
  runnableTiles,
  type FaceRow,
  type ScriptTile,
} from "@/lib/ugc/board";

type Job = { rowId: string; tileId: string };

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

export function useUgcBench() {
  const [rows, setRows] = useState<FaceRow[]>(() => [newRow()]);
  const [settings, setSettings] = useState<BenchSettings>(DEFAULT_SETTINGS);

  // Async work reads the latest state through refs, not stale closures.
  const rowsRef = useRef(rows);
  const settingsRef = useRef(settings);
  useEffect(() => void (rowsRef.current = rows), [rows]);
  useEffect(() => void (settingsRef.current = settings), [settings]);

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
      try {
        const data = await post<{ imageUrl: string | null; error: string | null }>(
          "/api/ugc/face",
          { prompt: row.facePrompt },
        );
        patchRow(
          rowId,
          data.imageUrl
            ? { faceStatus: "ready", faceUrl: data.imageUrl, faceAt: Date.now() }
            : { faceStatus: "rejected", faceError: data.error ?? "No image returned" },
        );
      } catch (e) {
        patchRow(rowId, { faceStatus: "rejected", faceError: String(e) });
      }
    },
    [patchRow],
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
      patchTile(rowId, tileId, { status: "generating", startedAt, ranScript: tile.script, error: null });

      const created = await post<{ taskId: string | null; error: string | null }>(
        "/api/ugc/video",
        { script: tile.script, referenceUrl: row.faceUrl, settings: settingsRef.current },
      );
      if (!created.taskId) return fail(created.error ?? "Seedance refused the task");

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const res = await fetch(`/api/ugc/video/${created.taskId}`);
        const polled = (await res.json()) as {
          status: string | null;
          videoUrl: string | null;
          error: string | null;
        };
        if (polled.status && TERMINAL_STATUSES.includes(polled.status)) {
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
      fail("Timed out after 7.5 minutes");
    },
    [patchTile],
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
  };
}

export type UgcBench = ReturnType<typeof useUgcBench>;
