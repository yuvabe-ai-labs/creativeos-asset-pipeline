import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import {
  listKBDocuments,
  listBrandImages,
  getActiveKBVersion,
} from "@/lib/db/kb";
import { getLatestKBJob } from "@/lib/db/kb-jobs";
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
import { ClientSectionNav } from "@/components/clients/client-section-nav";

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

  const [documents, images, activeKBVersion, latestJob] = await Promise.all([
    listKBDocuments(client.id),
    listBrandImages(client.id),
    getActiveKBVersion(client.id),
    getLatestKBJob(client.id),
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
      <Breadcrumb className="animate-rise shrink-0">
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

      <ClientSectionNav slug={client.slug} active="kb" />

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
        />
      ) : (
        <>
          <header className="animate-rise mb-8 mt-4">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Brand Knowledge Base
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Upload brand documents and images to extract your brand knowledge base.
            </p>
          </header>
          <KBOnboardingUploadStep
            clientId={client.id}
            clientSlug={client.slug}
            initialDocuments={documents}
            initialImages={images}
            initialWebsiteUrl={client.website_url ?? null}
            initialJob={latestJob}
          />
        </>
      )}
    </main>
  );
}
