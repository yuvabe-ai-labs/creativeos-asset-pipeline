import { loadClientPage } from "@/lib/permissions/page";
import { BrandAssetsLibrary } from "@/components/brand-assets/brand-assets-library";

export const dynamic = "force-dynamic";

// Images and videos imported from the brand's website and socials (D302). Its own page, reached
// from the Brand KB header and the client's Settings menu: a library of hundreds needs the full
// width and its own scroll, and it is not a KB module to review.
export default async function BrandAssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // the client slug
  const { client } = await loadClientPage(id, "view");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-6 pt-8">

      <div className="animate-rise">
        <BrandAssetsLibrary clientId={client.id} />
      </div>
    </main>
  );
}
