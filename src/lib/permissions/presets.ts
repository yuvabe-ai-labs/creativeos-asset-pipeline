import { ALL_PERMISSION_KEYS, type PermissionKey } from "./catalogue";

// D495 §2.2: the presets migration 0062 seeds. Owner is fixed (everything) and has no key
// list. seed-matches-catalogue.test.ts fails if the migration's lists drift from these.

export const MEDIA_APPROVE_KEYS: readonly PermissionKey[] = [
  "image_generation.approve",
  "video_generation.approve",
  "audio.approve",
];

/** Every key except the Team area. */
export const SENIOR_DEFAULT_KEYS: readonly PermissionKey[] = ALL_PERMISSION_KEYS.filter(
  (k) => !k.startsWith("team."),
);

/** Senior minus approving images, video and audio. Keeps scripts.approve: designers mark scripts final today. */
export const DESIGNER_DEFAULT_KEYS: readonly PermissionKey[] = SENIOR_DEFAULT_KEYS.filter(
  (k) => !MEDIA_APPROVE_KEYS.includes(k),
);
