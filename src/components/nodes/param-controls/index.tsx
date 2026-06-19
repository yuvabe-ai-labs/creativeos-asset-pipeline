"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";
import { SelectControl }   from "./select-control";
import { SliderControl }   from "./slider-control";
import { ToggleControl }   from "./toggle-control";
import { NumberControl }   from "./number-control";
import { TextareaControl } from "./textarea-control";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function ParamControl({ spec, form }: Props) {
  switch (spec.component) {
    case "select":   return <SelectControl   spec={spec} form={form} />;
    case "slider":   return <SliderControl   spec={spec} form={form} />;
    case "toggle":   return <ToggleControl   spec={spec} form={form} />;
    case "number":   return <NumberControl   spec={spec} form={form} />;
    case "textarea": return <TextareaControl spec={spec} form={form} />;
  }
}
