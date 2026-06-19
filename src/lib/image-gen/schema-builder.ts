import { z } from "zod";
import type { ParamSpec } from "./types";

export function buildZodFromParams(params: ParamSpec[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const param of params) {
    const { name, constraints, defaultValue } = param;
    let field: z.ZodTypeAny;

    switch (constraints.type) {
      case "select":
        field = z.enum(constraints.options as [string, ...string[]]);
        break;
      case "slider":
      case "number": {
        let num = z.number();
        if ("min" in constraints && constraints.min !== undefined) num = num.min(constraints.min);
        if ("max" in constraints && constraints.max !== undefined) num = num.max(constraints.max);
        field = num;
        break;
      }
      case "toggle":
        field = z.boolean();
        break;
      case "textarea": {
        let str = z.string();
        if (constraints.maxLength) str = str.max(constraints.maxLength);
        field = str;
        break;
      }
    }

    field = defaultValue !== null && defaultValue !== undefined
      ? field.default(defaultValue as never)
      : field.optional();

    shape[name] = field;
  }

  return z.object(shape);
}
