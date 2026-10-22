// Quiet-section detection (spec §6), ported from the rough-cut spike: Web Audio RMS, for review
// only — nothing is removed. Split in two so the analysis is testable: rmsWindows decodes in the
// browser (the file comes through the same-origin proxy, D245/D392), quietSections reads the
// windows for one piece. Ranges are SOURCE seconds.
export const WINDOW_SECONDS = 0.05;
export const QUIET_RMS = 0.015;
export const MIN_QUIET_SECONDS = 0.35;

/** RMS of channel 0 per 50 ms window (every 2nd sample, as the spike did). Browser only. */
export async function rmsWindows(bytes: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(bytes);
    const samples = buffer.getChannelData(0);
    const step = Math.round(buffer.sampleRate * WINDOW_SECONDS);
    const out = new Float32Array(Math.ceil(samples.length / step));
    for (let w = 0; w < out.length; w++) {
      const p = w * step;
      const n = Math.min(step, samples.length - p);
      let sum = 0;
      for (let k = 0; k < n; k += 2) sum += samples[p + k] * samples[p + k];
      out[w] = Math.sqrt(sum / Math.ceil(n / 2));
    }
    return out;
  } finally {
    await ctx.close();
  }
}

const round = (s: number) => Math.round(s * 1000) / 1000;

/** Quiet stretches longer than MIN_QUIET_SECONDS inside [from, to]. */
export function quietSections(windows: Float32Array, from: number, to: number): Array<[number, number]> {
  const segments: Array<[number, number]> = [];
  const first = Math.max(0, Math.floor(from / WINDOW_SECONDS + 1e-9));
  const last = Math.min(windows.length, Math.ceil(to / WINDOW_SECONDS - 1e-9));
  let open: number | null = null;
  for (let w = first; w < last; w++) {
    const t = Math.max(from, w * WINDOW_SECONDS);
    const quiet = windows[w] < QUIET_RMS;
    if (quiet && open === null) open = t;
    if (!quiet && open !== null) {
      if (t - open > MIN_QUIET_SECONDS) segments.push([round(open), round(t)]);
      open = null;
    }
  }
  if (open !== null && to - open > MIN_QUIET_SECONDS) segments.push([round(open), round(to)]);
  return segments;
}
