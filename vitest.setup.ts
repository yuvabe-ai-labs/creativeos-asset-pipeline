import { vi } from "vitest";

// Many tests mock resolveCallerContext with a partial caller and no `access`. Production accessOf()
// throws on that; in tests it falls back to access that allows everything in any agency, so those
// tests keep testing what they were written for. Tests about permissions pass a real `access` (see
// src/lib/permissions/test-fixtures.ts) or call vi.unmock("@/lib/permissions/server").
vi.mock("@/lib/permissions/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions/server")>();
  const { testAllowAllAccess } = await import("@/lib/permissions/test-fixtures");
  return {
    ...actual,
    accessOf: (caller: { access?: import("@/lib/permissions/model").Access }) => caller.access ?? testAllowAllAccess(),
  };
});
