"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { clientPermissionsFor } from "@/lib/permissions/check";
import { NO_CLIENT_PERMISSIONS, type ClientPermissions } from "@/lib/permissions/model";
import { AccessContext } from "./access-context";

// Spec §5: the canvas (and the editor) works out its client's answers (view, edit and the five permissions) once, beside
// ClientIdProvider; nodes read them from here and never run their own checks (performance rules
// 1 and 2). They change only when /api/me does, so a drag never re-renders a gated control.

const ClientPermissionsContext = createContext<ClientPermissions>(NO_CLIENT_PERMISSIONS);

/** For the component that owns the client id (the canvas, the editor shell). */
export function useClientPermissions(clientId: string): ClientPermissions {
  const { access, orgId } = useContext(AccessContext);
  return useMemo(() => clientPermissionsFor(access, orgId, clientId), [access, orgId, clientId]);
}

export function ClientPermissionsProvider({ value, children }: { value: ClientPermissions; children: ReactNode }) {
  return <ClientPermissionsContext.Provider value={value}>{children}</ClientPermissionsContext.Provider>;
}

/** Inside a canvas or the editor: the client's answers. Outside one: all false. */
export function useCanvasPermissions(): ClientPermissions {
  return useContext(ClientPermissionsContext);
}
