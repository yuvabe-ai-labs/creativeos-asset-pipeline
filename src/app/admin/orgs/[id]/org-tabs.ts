// The admin agency page's tabs, kept in the URL (?tab=) so a link can open one (Set permissions
// opens People with ?person=). Anything else falls back to Overview.
export const ORG_TABS = ["overview", "people", "clients", "generations", "support"] as const;
export type OrgTab = (typeof ORG_TABS)[number];

export function orgTabFrom(value: string | null | undefined): OrgTab {
  return (ORG_TABS as readonly string[]).includes(value ?? "") ? (value as OrgTab) : "overview";
}
