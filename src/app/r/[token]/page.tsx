import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReviewVersionByLink } from "@/lib/db/client-reviews";
import { parseReviewLink } from "@/lib/client-review/token";
import { buildPublicReview } from "@/lib/client-review/load";
import { ClientReviewPage } from "@/components/client-review/client-review-page";

// D309: the public client review page. Server-rendered with the review already loaded,
// so the first paint has the video and comments — no client fetch on first load.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review — Yuvabe Studios",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // D311 + D496: the title in the link is decoration; the code and the version find the cut.
  const link = parseReviewLink(token);
  const found = link ? await getReviewVersionByLink(link.token, link.versionNo) : null;
  if (!found) notFound();
  const initial = await buildPublicReview(found.review, found.version);
  return <ClientReviewPage token={token} initial={initial} />;
}
