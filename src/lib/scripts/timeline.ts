import type { Shot } from "./schema";

// Spec 1 §2.4 — the running timecode is worked out from the lengths, never typed. Rounded to a
// tenth so 2.5 + 2.5 + 3.5 never shows floating-point noise.
const round = (n: number) => Math.round(n * 10) / 10;

export type TimedShot = { shot: Shot; index: number; start: number; end: number };
export type BeatGroup = { beat: string; start: number; end: number; shots: TimedShot[] };

export function timeShots(shots: Shot[]): TimedShot[] {
  let t = 0;
  return shots.map((shot, index) => {
    const start = t;
    t = round(t + shot.lengthSeconds);
    return { shot, index, start, end: t };
  });
}

export function totalSeconds(shots: Shot[]): number {
  return round(shots.reduce((sum, s) => sum + s.lengthSeconds, 0));
}

export function formatSeconds(n: number): string {
  return String(round(n));
}

export function formatRange(start: number, end: number): string {
  return `${formatSeconds(start)}-${formatSeconds(end)}s`;
}

const beatKey = (beat: string) => beat.trim().toUpperCase();

/** Back-to-back shots with the same beat form one group. The timeline order always wins: a
 *  beat that comes back later starts a new group rather than merging with the first. */
export function groupByBeat(timed: TimedShot[]): BeatGroup[] {
  const groups: BeatGroup[] = [];
  for (const t of timed) {
    const key = beatKey(t.shot.beat);
    const last = groups[groups.length - 1];
    if (last && last.beat === key) {
      last.shots.push(t);
      last.end = t.end;
    } else {
      groups.push({ beat: key, start: t.start, end: t.end, shots: [t] });
    }
  }
  return groups;
}
