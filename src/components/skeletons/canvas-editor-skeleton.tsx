"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Graph frame — matches the SVG viewBox. Pill sits centered at ~(360, 210).
const NODE_W = 150;
const NODE_H = 70;

// Candidate placement regions (node top-left bounds) scattered around the pill.
// `side` is which way the node faces the central hub.
type Region = { side: "left" | "right"; lx: [number, number]; ty: [number, number] };
const REGIONS: Region[] = [
  { side: "left", lx: [20, 90], ty: [30, 70] }, // top-left
  { side: "right", lx: [500, 600], ty: [20, 60] }, // top-right
  { side: "left", lx: [10, 80], ty: [262, 318] }, // bottom-left
  { side: "right", lx: [505, 605], ty: [272, 330] }, // bottom-right
  { side: "left", lx: [10, 70], ty: [160, 205] }, // mid-left
  { side: "right", lx: [545, 615], ty: [158, 205] }, // mid-right
];

type NodeLayout = { left: number; top: number; edge: string };

// Deterministic default so SSR and the first client render match (no hydration
// mismatch); useEffect swaps in a randomized layout once mounted on the client.
const DEFAULT_LAYOUT: NodeLayout[] = [
  { left: 30, top: 50, edge: edgePath({ side: "left", left: 30 }, 80, 280, 192) },
  { left: 540, top: 30, edge: edgePath({ side: "right", left: 540 }, 70, 440, 196) },
  { left: 20, top: 280, edge: edgePath({ side: "left", left: 20 }, 312, 300, 226) },
  { left: 520, top: 290, edge: edgePath({ side: "right", left: 520 }, 322, 420, 224) },
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function pick<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

// Orthogonal rounded path (smoothstep-style) from a list of points.
function roundedPath(pts: [number, number][], r = 14): string {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(cx - px, cy - py) || 1;
    const outLen = Math.hypot(nx - cx, ny - cy) || 1;
    const ri = Math.min(r, inLen / 2, outLen / 2);
    d += ` L${cx - ((cx - px) / inLen) * ri},${cy - ((cy - py) / inLen) * ri}`;
    d += ` Q${cx},${cy} ${cx + ((nx - cx) / outLen) * ri},${cy + ((ny - cy) / outLen) * ri}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0]},${last[1]}`;
}

// Step a node into the central pill: node facing-edge → trunk → pill port.
function edgePath(
  node: { side: "left" | "right"; left: number },
  exitY: number,
  portX: number,
  portY: number,
): string {
  const exitX = node.side === "left" ? node.left + NODE_W : node.left;
  const trunkX =
    node.side === "left"
      ? Math.min(exitX + 30, portX - 15)
      : Math.max(exitX - 30, portX + 15);
  return roundedPath([
    [exitX, exitY],
    [trunkX, exitY],
    [trunkX, portY],
    [portX, portY],
  ]);
}

function buildLayout(): NodeLayout[] {
  const count = 3 + Math.floor(Math.random() * 3); // 3..5
  return pick(REGIONS, count).map((r) => {
    const left = Math.round(rand(r.lx[0], r.lx[1]));
    const top = Math.round(rand(r.ty[0], r.ty[1]));
    const exitY = Math.round(top + rand(22, NODE_H - 22));
    const portX = r.side === "left" ? Math.round(rand(276, 292)) : Math.round(rand(428, 444));
    const portY = Math.round(rand(192, 228));
    return { left, top, edge: edgePath({ side: r.side, left }, exitY, portX, portY) };
  });
}

function GhostNode({ left, top }: { left: number; top: number }) {
  return (
    <div className="animate-rise absolute w-[150px]" style={{ left, top }}>
      <div className="space-y-2 rounded-xl border bg-card p-3 shadow-card">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-4/5" />
      </div>
    </div>
  );
}

export function CanvasEditorSkeleton() {
  const [nodes, setNodes] = useState<NodeLayout[]>(DEFAULT_LAYOUT);

  // Randomize node count + positions on the client only (avoids SSR mismatch).
  useEffect(() => setNodes(buildLayout()), []);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center border-b border-border/70 bg-background/60 px-6 py-3 backdrop-blur">
        <Skeleton className="h-4 w-72" />
      </header>

      <div className="canvas-surface relative flex-1 overflow-hidden">
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative h-[420px] w-[720px] max-w-full">
            <svg
              viewBox="0 0 720 420"
              fill="none"
              className="absolute inset-0 h-full w-full text-neutral-300"
              aria-hidden
            >
              {nodes.map((n, i) => (
                <path
                  key={i}
                  d={n.edge}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="4 7"
                  className="animate-dash-flow"
                />
              ))}
            </svg>

            {nodes.map((n, i) => (
              <GhostNode key={i} left={n.left} top={n.top} />
            ))}

            {/* Centered loading pill — single brand dot as the only purple accent */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-2.5 rounded-full border bg-card px-5 py-2.5 shadow-card">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                <span className="font-display text-sm font-medium text-muted-foreground">
                  Loading canvas…
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
