import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import {
  listKBDocuments,
  listBrandImages,
  getActiveKBVersion,
} from "@/lib/db/kb";
import { getLatestKBJob } from "@/lib/db/kb-jobs";
import { getBrandDetails } from "@/lib/db/brand-kit";
import { ClientIdentity } from "@/components/clients/client-identity";
import { KBOnboardingUploadStep } from "@/components/kb/kb-onboarding-upload-step";
import { KBOnboardingReviewStep } from "@/components/kb/kb-onboarding-review-step";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { kbRevision } from "@/lib/kb/review-sync";

export const dynamic = "force-dynamic";

export default async function KBPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();

  // Org isolation: a client outside the caller's org redirects the same as a
  // nonexistent one — see the note in ../page.tsx.
  if (!client || client.org_id !== effectiveOrgId) {
    redirect("/");
  }

  const [documents, images, activeKBVersion, latestJob, brandDetails] = await Promise.all([
    listKBDocuments(client.id),
    listBrandImages(client.id, "uploads"),
    getActiveKBVersion(client.id),
    getLatestKBJob(client.id),
    getBrandDetails(client.id),
  ]);

  const isReviewOrEdit =
    (client.kb_status === "in_review" || client.kb_status === "ready") &&
    activeKBVersion !== null;

  const isEditMode = client.kb_status === "ready";

  return (
    <main
      className={
        isReviewOrEdit
          ? "mx-auto flex h-[calc(100vh-9.5rem)] w-full max-w-5xl flex-col px-6 pt-8" // header 4rem + client bar 5.5rem
          : "mx-auto w-full max-w-5xl flex-1 px-6 pb-12 pt-4"
      }
    >

      {isReviewOrEdit ? (
        <KBOnboardingReviewStep
          key={activeKBVersion!.id}
          clientId={client.id}
          clientSlug={client.slug}
          versionId={activeKBVersion!.id}
          initialKB={activeKBVersion!.output as TraceableBrandKB}
          kbRevision={kbRevision(activeKBVersion!.output as TraceableBrandKB)}
          isEditMode={isEditMode}
          initialDocuments={documents}
          initialImages={images}
          initialWebsiteUrl={client.website_url ?? null}
          docIdsAtExtraction={(activeKBVersion!.doc_ids_used as string[]) ?? []}
          clientName={client.name}
          clientLogoUrl={client.logo_url}
        />
      ) : (
        <>
          <header className="animate-rise mb-8 mt-4">
            <h1 className="text-eyebrow mb-3 text-muted-foreground">Brand Knowledge Base</h1>
            <ClientIdentity clientId={client.id} name={client.name} logoUrl={client.logo_url} size="md" />
            <p className="mt-3 text-sm text-muted-foreground">
              Upload brand documents and images to extract your brand knowledge base.
            </p>
          </header>
          <KBOnboardingUploadStep
            clientId={client.id}
            clientSlug={client.slug}
            initialDocuments={documents}
            initialImages={images}
            initialWebsiteUrl={client.website_url ?? null}
            initialInstagram={brandDetails.instagram ?? null}
            initialFacebook={brandDetails.facebook ?? null}
            initialJob={latestJob}
          />
        </>
      )}
    </main>
  );
}
