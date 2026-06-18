import type { ImageGenClientModel } from "./client-models";

export function enumOptions(model: ImageGenClientModel, field: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = model.schema as any;
  const shape = s?.shape ?? s?._def?.shape ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fieldDef = shape[field] as any;
  const inner = fieldDef?._def?.innerType ?? fieldDef;
  const values =
    inner?._def?.values ?? inner?.options ?? inner?._def?.options ?? [];
  return Array.isArray(values) ? values : Object.values(values ?? {});
}
