import { loadClientPage } from "@/lib/permissions/page";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandAssetsLibrary } from "@/components/brand-assets/brand-assets-library";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

// Images and videos imported from the brand's website and socials (D302). Its own page, reached
// from the Brand KB header and the client's Settings menu: a library of hundreds needs the full
// width and its own scroll, and it is not a KB module to review.
export default async function BrandAssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // the client slug
  const { client } = await loadClientPage(id, "view");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
      <Breadcrumb className="animate-rise mb-5">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/">Clients</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/clients/${client.slug}/kb`}>Brand KB</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Brand assets</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="animate-rise">
        <BrandAssetsLibrary clientId={client.id} />
      </div>
    </main>
  );
}
