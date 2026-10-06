import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReviewByToken } from "@/lib/db/client-reviews";
import { isWellFormedToken } from "@/lib/client-review/token";
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
  const review = isWellFormedToken(token) ? await getReviewByToken(token) : null;
  if (!review) notFound();
  const initial = await buildPublicReview(review);
  return <ClientReviewPage token={token} initial={initial} />;
}
