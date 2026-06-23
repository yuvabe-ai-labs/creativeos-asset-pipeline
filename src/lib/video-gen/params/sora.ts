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
    constraints: {
      type: "select",
      options: ["1280x720", "720x1280", "1792x1024", "1024x1792"],
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
