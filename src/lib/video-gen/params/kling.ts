import type { ParamSpec } from "@/lib/image-gen/types";

function resolutionParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "resolution",
    label: "Resolution",
    component: "select",
    group: "primary",
    order: 0,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

function durationParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "duration",
    label: "Duration",
    component: "select",
    group: "primary",
    order: 1,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

function audioParam(options: string[], defaultValue: string): ParamSpec {
  return {
    name: "audio",
    label: "Audio",
    component: "select",
    group: "advanced",
    order: 0,
    visible: true,
    defaultValue,
    constraints: { type: "select", options },
  };
}

const multiShotParam: ParamSpec = {
  name: "multi_shot",
  label: "Multi-Shot",
  component: "toggle",
  group: "advanced",
  order: 1,
  visible: true,
  defaultValue: true,
  constraints: { type: "toggle" },
};

const DURATION_3_TO_15 = [
  "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15",
];

export const kling30TurboParams: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationParam(DURATION_3_TO_15, "5"),
];

export const kling26Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationParam(["5", "10"], "5"),
  audioParam(["native", "off"], "off"),
];

export const kling25TurboParams: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationParam(["5", "10"], "5"),
];

export const kling30Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p", "4k"], "720p"),
  durationParam(DURATION_3_TO_15, "5"),
  audioParam(["native", "off"], "off"),
  multiShotParam,
];

export const klingO1Params: ParamSpec[] = [
  resolutionParam(["720p", "1080p"], "720p"),
  durationParam(["3", "4", "5", "6", "7", "8", "9", "10"], "5"),
  audioParam(["original", "off"], "off"),
];
