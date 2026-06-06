import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import {
  listKBDocuments,
  listBrandImages,
  getActiveKBVersion,
} from "@/lib/db/kb";
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
  const client = await getClientBySlug(id);

  if (!client) {
    redirect("/");
  }

  const [documents, images, activeKBVersion] = await Promise.all([
    listKBDocuments(client.id),
    listBrandImages(client.id),
    getActiveKBVersion(client.id),
  ]);

  const isReviewOrEdit =
    (client.kb_status === "in_review" || client.kb_status === "ready") &&
    activeKBVersion !== null;

  const isEditMode = client.kb_status === "ready";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <Breadcrumb className="animate-rise">
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

      <header className="animate-rise mb-8 mt-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Brand Knowledge Base
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isReviewOrEdit
            ? isEditMode
              ? "Your brand KB is live. Add or remove source documents and re-extract, or edit fields directly."
              : "Review the extracted brand knowledge and approve, edit, or reject each field."
            : "Upload brand documents and images to extract your brand knowledge base."}
        </p>
      </header>

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
          docIdsAtExtraction={(activeKBVersion!.doc_ids_used as string[]) ?? []}
        />
      ) : (
        <KBOnboardingUploadStep
          clientId={client.id}
          clientSlug={client.slug}
          initialDocuments={documents}
          initialImages={images}
        />
      )}
    </main>
  );
}
