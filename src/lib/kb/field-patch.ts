import type { KBField } from "./schema";

// One change to one field of the brand KB: where the field is, and the parts of it that change.
// Whatever the patch leaves out stays as stored.

export type KBFieldPatch = {
  path: string[];
  patch: Partial<Pick<KBField<unknown>, "value" | "status" | "confidence" | "evidence_type">>;
};
