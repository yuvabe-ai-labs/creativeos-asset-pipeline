"use client";

import type { ReactNode } from "react";
import type { Permission } from "@/lib/permissions/model";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { AccessContext } from "./access-context";

/** For component tests: no `permissions` = the owner of org-1 (everything); otherwise a member
 *  of org-1 with `permissions` on `clientIds` (default ["c1"]). */
export function TestAccessProvider({
  permissions,
  clientIds = ["c1"],
  children,
}: {
  permissions?: readonly Permission[];
  clientIds?: readonly string[];
  children: ReactNode;
}) {
  const access = permissions === undefined ? testOwnerAccess("org-1") : testAccess({ permissions, clientIds });
  return <AccessContext.Provider value={{ access, orgId: "org-1" }}>{children}</AccessContext.Provider>;
}
