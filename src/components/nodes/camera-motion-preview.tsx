"use client";

import type { CSSProperties } from "react";

/**
 * Animated schematic of one camera move, for the Video Prompt's Camera tiles.
 *
 * A small 3D set — ground plane, a subject block, one background block for
 * parallax — with the CAMERA RIG animating and the subject holding still. That
 * separation is the whole point: it is what distinguishes an orbit (rig arcs
 * around a fixed subject) from a pan (rig yaws in place), which no still image
 * can show. Ported from the Camera Motion 3D design canvas; keyframes live in
 * globals.css alongside the reduced-motion opt-out.
 *
 * Animations inherit `animation-play-state`, so the tile decides when they run —
 * see ShotTileStrip, which holds them paused until hover or selection rather
 * than looping nine scenes at once.
 */

// Source geometry, kept at the canvas's native pixel scale and shrunk with a
// single transform. Rewriting each number for the ~94px tile would mean
// re-deriving every translate, rotate and perspective value, and the projection
// only reads correctly at the proportions it was drawn for.
const SCENE_W = 260;
const SCENE_H = 162;

type Move = {
  /** Animation on the camera rig. */
  cam?: string;
  /** Animation on the ground plane — tracking moves the world, not the rig. */
  ground?: string;
  /** Rig pivot. Tripod moves (pan/tilt) rotate about the CAMERA, so their origin
   *  sits at the viewer, not the subject. */
  origin?: string;
  /** Static has no motion at all, so a blinking record dot carries "live". */
  rec?: boolean;
};

const MOVES: Record<string, Move> = {
  static: { rec: true },
  "push-in": { cam: "cam-push 1.8s var(--cam-ease) infinite alternate" },
  "pull-back": { cam: "cam-pull 2.2s var(--cam-ease) infinite alternate" },
  orbit: { cam: "cam-orbit 2.6s ease-in-out infinite alternate" },
  tracking: { ground: "cam-track 1.1s linear infinite" },
  pan: { cam: "cam-pan 2.4s ease-in-out infinite alternate", origin: "0 0 260px" },
  tilt: { cam: "cam-tilt 2.2s ease-in-out infinite alternate", origin: "0 0 260px" },
  handheld: { cam: "cam-hand .9s linear infinite" },
  crane: { cam: "cam-crane 2.6s var(--cam-ease) infinite alternate" },
};

export function hasCameraMotionPreview(value: string): boolean {
  return value in MOVES;
}

const inherit: CSSProperties = { animationPlayState: "inherit" };

const layer: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  transformStyle: "preserve-3d",
};

// Faces are mixed against --card rather than pinned to fixed hexes, so the planes
// keep their separation in light AND dark themes. Two palettes: the SUBJECT wears
// the brand purple (it is what the camera is pointed at), the background block
// stays neutral and recedes. Without that contrast, orbit and pan look identical —
// the only thing distinguishing them is parallax BETWEEN the two blocks.
type Palette = { tint: string; edge: string; faces: [number, number, number, number] };

const SUBJECT: Palette = {
  tint: "var(--primary)",
  edge: "color-mix(in oklab, var(--primary) 65%, var(--foreground))",
  faces: [26, 62, 44, 16], // front, right, left, top
};

const BACKDROP: Palette = {
  tint: "var(--foreground)",
  edge: "color-mix(in oklab, var(--foreground) 45%, var(--card))",
  faces: [10, 34, 22, 6],
};

function face(p: Palette, mix: number, transform: string): CSSProperties {
  return {
    position: "absolute",
    left: -15,
    top: -30,
    width: 30,
    height: 30,
    boxSizing: "border-box",
    background: `color-mix(in oklab, ${p.tint} ${mix}%, var(--card))`,
    border: `1.5px solid ${p.edge}`,
    transform,
  };
}

function Block({ palette }: { palette: Palette }) {
  const [front, right, left, top] = palette.faces;
  return (
    <>
      <span style={face(palette, front, "translateZ(15px)")} />
      <span style={face(palette, right, "rotateY(90deg) translateZ(15px)")} />
      <span style={face(palette, left, "rotateY(-90deg) translateZ(15px)")} />
      <span style={face(palette, top, "rotateX(90deg) translateZ(15px)")} />
    </>
  );
}

export function CameraMotionPreview({ value }: { value: string }) {
  const move = MOVES[value] ?? {};

  return (
    <span
      className="cam-scene"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        overflow: "hidden",
        background: "var(--card)",
        ...inherit,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: SCENE_W,
          height: SCENE_H,
          marginLeft: -SCENE_W / 2,
          marginTop: -SCENE_H / 2,
          // Fits the 260px scene to the tile. With the Frame column gone the camera
          // grid spans the full column, so a tile is ~142px wide: 142/260 = 0.55.
          transform: "scale(var(--cam-scale, 0.55))",
          transformOrigin: "center",
          perspective: "260px",
          perspectiveOrigin: "50% 16%",
          display: "block",
          ...inherit,
        }}
      >
        {/* Rig anchor — the point the whole set hangs from. */}
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "62%",
            width: 0,
            height: 0,
            transformStyle: "preserve-3d",
            ...inherit,
          }}
        >
          {/* The camera itself. Everything below is the world it looks at. */}
          <span
            style={{
              ...layer,
              transformOrigin: move.origin ?? "50% 50%",
              animation: move.cam,
              ...inherit,
            }}
          >
            <span style={{ ...layer, transform: "rotateY(-22deg)" }}>
              {/* Ground plane — a grid so translation and parallax are visible. */}
              <span
                style={{
                  position: "absolute",
                  left: -130,
                  top: -85,
                  width: 260,
                  height: 170,
                  transform: "rotateX(90deg)",
                  backgroundColor: "color-mix(in oklab, var(--foreground) 5%, var(--card))",
                  backgroundImage: [
                    "repeating-linear-gradient(0deg,transparent 0 23px,color-mix(in oklab, var(--foreground) 26%, transparent) 23px 24px)",
                    "repeating-linear-gradient(90deg,transparent 0 23px,color-mix(in oklab, var(--foreground) 26%, transparent) 23px 24px)",
                  ].join(","),
                  animation: move.ground,
                  ...inherit,
                }}
              />
              <Block palette={SUBJECT} />
              {/* Second block, set back and to the side: without it, orbit and pan
                  look identical, because parallax is the only cue separating them. */}
              <span
                style={{
                  ...layer,
                  transform: "translate3d(-52px,0,-55px) scale(.55)",
                }}
              >
                <Block palette={BACKDROP} />
              </span>
            </span>
          </span>
        </span>
      </span>

      {/* Viewfinder furniture, pinned flat over the scene. */}
      <svg
        viewBox="0 0 96 64"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...inherit }}
      >
        <path
          d="M10 16v-6h6M80 10h6v6M86 48v6h-6M16 54h-6v-6"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={2}
        />
        {move.rec && (
          <circle
            cx={80}
            cy={14}
            r={2.6}
            fill="var(--primary)"
            style={{ animation: "cam-blink 1.6s linear infinite", ...inherit }}
          />
        )}
      </svg>
    </span>
  );
}
