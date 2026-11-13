import { redirect } from "next/navigation";
import { isWaiting } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { OnboardingNotice } from "@/components/onboarding/onboarding-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome — CreativeOS" };

// Spec §6.4. Only for someone waiting (spec §2.4); anyone else goes home. No live update: the
// person is emailed when their access is ready and opens the app again (D503).
export default async function OnboardingPage() {
  const { caller, effectiveOrgId } = await resolveActingCaller();
  const access = accessOf(caller);
  if (!isWaiting(access, effectiveOrgId)) redirect("/");
  const orgName = access.orgs.get(effectiveOrgId)?.orgName || "Your agency";
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <OnboardingNotice orgName={orgName} />
    </main>
  );
}
