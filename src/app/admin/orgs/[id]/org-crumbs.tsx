"use client";

import { useSearchParams } from "next/navigation";
import { PageCrumbs } from "@/components/shared/page-crumbs";
import { adminOrgCrumbs, orgTabFrom } from "./org-tabs";

// Agencies › {Agency} › {Tab}. The tab is in the URL, so the trail follows a tab switch; the
// agency crumb goes back to Overview with a history entry, like the tabs themselves.
export function OrgCrumbs({ org }: { org: { id: string; name: string } }) {
  const tab = orgTabFrom(useSearchParams().get("tab"));
  return <PageCrumbs items={adminOrgCrumbs(org, tab)} onNavigate={(href) => window.history.pushState(null, "", href)} />;
}
