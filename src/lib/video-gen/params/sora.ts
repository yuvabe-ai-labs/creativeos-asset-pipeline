import type { ParamSpec } from "@/lib/image-gen/types";

export const soraParams: ParamSpec[] = [
  {
    name: "size",
    label: "Size",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue: "1280x720",
    // sora-2 (this file's SORA_MODEL, hardcoded in providers/sora.ts) only has a documented
    // 720p pricing tier — 1792x1024/1024x1792 belong to sora-2-pro, a model this app never
    // calls. Removed 2026-07-24 (found via a full model/params-vs-pricing audit): those two
    // sizes weren't validly priced, matching the same class of bug already found and fixed
    // for gemini-2.5-flash-image.
    constraints: {
      type: "select",
      options: ["1280x720", "720x1280"],
    },
  },
  {
    name: "seconds",
    label: "Duration",
    component: "select",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue: "4",
    constraints: { type: "select", options: ["4", "8", "12"] },
  },
];
