import { loadClientPage } from "@/lib/permissions/page";
import {
  listKBDocuments,
  listBrandImages,
  getActiveKBVersion,
} from "@/lib/db/kb";
import { getLatestKBJob } from "@/lib/db/kb-jobs";
import { getBrandDetails } from "@/lib/db/brand-kit";
import { ClientIdentity } from "@/components/clients/client-identity";
import { ClientMembersButton } from "@/components/clients/client-members-button";
import { KBRequiredToast } from "@/components/kb/kb-required-toast";
import { KB_REQUIRED_PARAM, KB_REQUIRED_VALUE } from "@/lib/clients/kb-gate";
import { KBOnboardingUploadStep } from "@/components/kb/kb-onboarding-upload-step";
import { KBOnboardingReviewStep } from "@/components/kb/kb-onboarding-review-step";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { kbRevision } from "@/lib/kb/review-sync";

export const dynamic = "force-dynamic";

export default async function KBPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // D503: Scripts or Avatars sent the user here because the KB isn't ready; say so in a toast.
  const kbRequired = (await searchParams)[KB_REQUIRED_PARAM] === KB_REQUIRED_VALUE;
  const { client } = await loadClientPage(id, "view");

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

      {kbRequired && <KBRequiredToast />}
      {/* Until the brand KB is ready the client page sends everyone here, so the Members button
          that sits in the client page's header sits in this page too (spec 6.2). The review step
          has no header of its own, so there it sits above the step. */}
      {isReviewOrEdit && !isEditMode && (
        <div className="animate-rise flex shrink-0 justify-end">
          <ClientMembersButton slug={client.slug} clientId={client.id} />
        </div>
      )}

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
          <header className="animate-rise mb-8 mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-eyebrow mb-3 text-muted-foreground">Brand Knowledge Base</h1>
              <ClientIdentity clientId={client.id} name={client.name} logoUrl={client.logo_url} size="md" />
              <p className="mt-3 text-sm text-muted-foreground">
                Upload brand documents and images to extract your brand knowledge base.
              </p>
            </div>
            {!isEditMode && <ClientMembersButton slug={client.slug} clientId={client.id} />}
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
