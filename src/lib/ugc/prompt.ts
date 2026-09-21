import type { BenchSettings } from "./constants";

// Seedance reads generation settings from --flags inside the prompt text, not JSON
// fields. Get this wrong and you silently get model defaults.
export function buildSeedancePrompt(script: string, s: BenchSettings): string {
  const flags = [
    `--resolution ${s.resolution}`,
    `--duration ${s.duration}`,
    `--ratio ${s.ratio}`,
    `--watermark false`,
  ].join(" ");
  return `${script.trim()} ${flags}`;
}
