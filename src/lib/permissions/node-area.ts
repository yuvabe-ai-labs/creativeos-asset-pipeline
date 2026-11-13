import type { PermissionKey } from "./catalogue";

// D495: approving a version needs Approve on that node's area. A prompt node is approved in the
// area it feeds: an image prompt with images, a video or multishot prompt with video.
// node-area.test.ts lists every component that approves, so a new one cannot go unmapped.
const APPROVE_KEY_BY_NODE_TYPE: Readonly<Record<string, PermissionKey>> = {
  "image-gen": "image_generation.approve",
  composite: "image_generation.approve",
  prompt: "image_generation.approve",
  "video-gen": "video_generation.approve",
  "video-prompt": "video_generation.approve",
  "multishot-prompt": "video_generation.approve",
  dubbing: "audio.approve",
};

export function approveKeyForNodeType(nodeType: string): PermissionKey | null {
  return APPROVE_KEY_BY_NODE_TYPE[nodeType] ?? null;
}
