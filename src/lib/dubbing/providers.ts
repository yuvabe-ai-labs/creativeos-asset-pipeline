// D376 — one engine per step for now. A second model or vendor is a new entry plus a picker;
// the node, routes and versions read these and don't change.
export const DUB_ENGINE = { provider: "sarvam", model: "sarvam-dub", modelUsed: "sarvam:dub" } as const;
export const LIP_SYNC_ENGINE = { provider: "fal", model: "lipsync-2-pro", modelUsed: "fal:lipsync-2-pro" } as const;
