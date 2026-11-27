import type { Crumb } from "@/lib/people/nav";

// The admin agency page's tabs, kept in the URL (?tab=) so a link can open one (Set permissions
// opens People with ?person=). Anything else falls back to Overview.
export const ORG_TABS = ["overview", "billing", "people", "clients", "generations", "support"] as const;
export type OrgTab = (typeof ORG_TABS)[number];

export const ORG_TAB_LABEL: Record<OrgTab, string> = {
  overview: "Overview",
  billing: "Billing",
  people: "People",
  clients: "Clients",
  generations: "Generations",
  support: "Support activity",
};

export function orgTabFrom(value: string | null | undefined): OrgTab {
  return (ORG_TABS as readonly string[]).includes(value ?? "") ? (value as OrgTab) : "overview";
}

// The address for a tab (and the client open in Clients, or the person open in People). A tab
// change drops the client and person it doesn't carry.
export function orgTabUrl(
  pathname: string,
  current: URLSearchParams,
  next: { tab: OrgTab; client?: string | null; person?: string | null },
): string {
  const params = new URLSearchParams(current.toString());
  params.delete("client");
  params.delete("person");
  params.set("tab", next.tab);
  if (next.client) params.set("client", next.client);
  if (next.person) params.set("person", next.person);
  return `${pathname}?${params.toString()}`;
}

// The Clients tab with a client open: All clients › {Client}.
export function adminClientCrumbs(orgId: string, client: { name: string }): Crumb[] {
  return [{ label: "All clients", href: `/admin/orgs/${orgId}?tab=clients` }, { label: client.name }];
}
