"use client";

import { createContext } from "react";
import type { BrowserClientScope } from "@/lib/permissions/browser";

// The client scope AccessProvider derives once from the me payload; consumers read it from here
// instead of each mounting a query (performance rules 1 and 2).
export const ClientScopeContext = createContext<BrowserClientScope>(null);
