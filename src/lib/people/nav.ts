// Where you are on the people screens: the breadcrumb trails and the Team page link.
// A crumb without href is the current page (the last one).
export type Crumb = { label: string; href?: string };

type ClientRef = { name: string; slug: string };

const clientCrumbs = (client: ClientRef): Crumb[] => [
  { label: "Clients", href: "/" },
  { label: client.name, href: `/clients/${client.slug}` },
];

export function membersCrumbs(client: ClientRef): Crumb[] {
  return [...clientCrumbs(client), { label: "Members" }];
}

// From a client's Members page (?from=<slug>) the Team page keeps that client's trail, so the way
// back is one click.
export function teamCrumbs(from: ClientRef | null): Crumb[] {
  if (!from) return [{ label: "Clients", href: "/" }, { label: "Team" }];
  return [...clientCrumbs(from), { label: "Members", href: `/clients/${from.slug}/members` }, { label: "Team" }];
}

// Set and Edit permissions on a Members list open that person on the Team page.
export function teamPersonHref(userId: string, fromSlug?: string | null): string {
  const params = new URLSearchParams({ person: userId });
  if (fromSlug) params.set("from", fromSlug);
  return `/team?${params.toString()}`;
}
