import type { ReactNode } from "react";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { browserCatalog } from "@/lib/ai-models/browser-catalog";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { ModelCatalogGate } from "@/components/models/model-catalog-gate";

// D542 — every client page (canvas, avatars, scripts) shows models, so the catalog is read here
// once (cached 60 s on the server) and seeds the browser's cache: no page waits on its own
// request. Signed out, the pages handle the redirect themselves, so nothing is read.
export default async function ClientLayout({ children }: { children: ReactNode }) {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return <>{children}</>;
  const catalog = await getAiCatalog().then(browserCatalog).catch((e) => {
    console.error("[clients layout] catalog read failed", e);
    return undefined;
  });
  return <ModelCatalogGate initialCatalog={catalog}>{children}</ModelCatalogGate>;
}
