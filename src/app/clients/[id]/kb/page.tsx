import { loadClientPage } from "@/lib/permissions/page";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  listKBDocuments,
  listBrandImages,
  getActiveKBVersion,
} from "@/lib/db/kb";
import { getLatestKBJob } from "@/lib/db/kb-jobs";
import { getBrandDetails } from "@/lib/db/brand-kit";
import { ClientIdentity } from "@/components/clients/client-identity";
import { ClientMembersButton } from "@/components/clients/client-members-button";
import { KBOnboardingUploadStep } from "@/components/kb/kb-onboarding-upload-step";
import { KBOnboardingReviewStep } from "@/components/kb/kb-onboarding-review-step";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { TraceableBrandKB } from "@/lib/kb/schema";

export const dynamic = "force-dynamic";

export default async function KBPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
          ? "mx-auto flex h-[calc(100vh-4rem)] w-full max-w-5xl flex-col px-6 pt-6"
          : "mx-auto w-full max-w-5xl flex-1 px-6 py-12"
      }
    >
      {/* Until the brand KB is ready the client page sends everyone here, so the Members button
          that sits beside Brand Workspace there sits beside the breadcrumb here (spec 6.2). */}
      <div className="animate-rise flex shrink-0 items-center justify-between gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/">Clients</Link>} />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink
                render={
                  <Link href={`/clients/${client.slug}`}>{client.name}</Link>
                }
              />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Brand KB</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {!isEditMode && <ClientMembersButton slug={client.slug} clientId={client.id} />}
      </div>

      {isReviewOrEdit ? (
        <KBOnboardingReviewStep
          key={activeKBVersion!.id}
          clientId={client.id}
          clientSlug={client.slug}
          versionId={activeKBVersion!.id}
          initialKB={activeKBVersion!.output as TraceableBrandKB}
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
