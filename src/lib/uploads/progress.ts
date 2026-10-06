// Bytes sent → a whole percent for a determinate progress bar. Floors, so the bar only
// reads 100 once the last byte is out; an unknown total (lengthComputable false) reads 0.
export function toUploadPercent(loaded: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor((loaded / total) * 100)));
}
