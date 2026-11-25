import "server-only";
import { imageAdapters } from "@/lib/image-gen/adapters";
import { videoAdapters } from "@/lib/video-gen/adapters";

/** D569 — the adapter keys this build can run. An image or video model may be live only with one. */
export const RUNNABLE_ADAPTER_KEYS: ReadonlySet<string> = new Set([...Object.keys(imageAdapters), ...Object.keys(videoAdapters)]);
