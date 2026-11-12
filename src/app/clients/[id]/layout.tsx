import type { ReactNode } from "react";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { journeyState } from "@/lib/journey/stages";
import { ClientFrame } from "@/components/journey/client-frame";

// The frame around every client screen (copilot journey spec §4.1). The client is read once here
// and shared with the page (getClientBySlug is cache()d per request). A missing client, or one
// outside the caller's org, gets no frame: the page decides what to show, and the tabs must never
// name a client the caller may not see.
export default async function ClientLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // `id` is the client slug
  const [client, effectiveOrgId] = await Promise.all([getClientBySlug(id), resolveOrgId()]);
  if (!client || client.org_id !== effectiveOrgId) return children;

  return (
    <ClientFrame
      client={{ id: client.id, slug: client.slug, name: client.name, kbStatus: client.kb_status }}
      state={journeyState(client)}
    >
      {children}
    </ClientFrame>
  );
}
