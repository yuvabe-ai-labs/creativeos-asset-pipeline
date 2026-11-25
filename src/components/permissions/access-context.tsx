"use client";

import { createContext } from "react";
import { NO_ACCESS, type Access } from "@/lib/permissions/model";

/** The person's access and the agency they act in: built once per /api/me payload. */
export type BrowserAccess = { access: Access; orgId: string };

export const AccessContext = createContext<BrowserAccess>({ access: NO_ACCESS, orgId: "" });
