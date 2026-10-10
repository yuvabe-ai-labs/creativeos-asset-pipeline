// src/app/r/s/[token]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { toCanonicalShareToken } from "@/lib/client-review/token";
import { getScriptReviewByToken } from "@/lib/db/script-reviews";
import { buildPublicScriptReview } from "@/lib/script-review/load";
import { ScriptReviewPage } from "@/components/script-review/script-review-page";

// D356: the client's page for a script. Server-rendered with the version already loaded, so the
// first paint has the reel and its comments. No app chrome: AppHeader hides on /r/*.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review — Yuvabe Studios",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const code = toCanonicalShareToken(token);
  const review = code ? await getScriptReviewByToken(code) : null;
  const initial = review ? await buildPublicScriptReview(review) : null;
  if (!initial) notFound();
  return <ScriptReviewPage token={token} initial={initial} />;
}
