"use client";

import type { ParamSpec } from "@/lib/image-gen/types";
import { SelectControl }   from "./select-control";
import { SliderControl }   from "./slider-control";
import { ToggleControl }   from "./toggle-control";
import { NumberControl }   from "./number-control";
import { TextareaControl } from "./textarea-control";

type Props = {
  spec: ParamSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
};

export function ParamControl({ spec, value, onChange, disabled }: Props) {
  switch (spec.component) {
    case "select":   return <SelectControl   spec={spec} value={value} onChange={onChange} />;
    case "slider":   return <SliderControl   spec={spec} value={value} onChange={onChange} disabled={disabled} />;
    case "toggle":   return <ToggleControl   spec={spec} value={value} onChange={onChange} />;
    case "number":   return <NumberControl   spec={spec} value={value} onChange={onChange} />;
    case "textarea": return <TextareaControl spec={spec} value={value} onChange={onChange} />;
  }
}
