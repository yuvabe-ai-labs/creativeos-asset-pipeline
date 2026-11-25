import { redirect } from "next/navigation";
import type { ClientRow } from "@/lib/db/types";

/**
 * A client's working surfaces (canvases, scripts, avatars) open only once its Brand KB is
 * set up and approved (D503). Every entry point asks this one function, so the pages and the
 * create routes can't disagree about whether a client is ready.
 */
export function isKbReady(client: Pick<ClientRow, "kb_status">): boolean {
  return client.kb_status === "ready";
}

/** The query flag that makes the KB page say why the user landed there (D503). */
export const KB_REQUIRED_PARAM = "kb";
export const KB_REQUIRED_VALUE = "required";

/** The toast and the create routes' refusal, for a client whose Brand KB isn't ready. */
export const KB_NOT_READY_MESSAGE = "Set up the Brand KB first.";

/**
 * Page guard: sends a client that isn't ready to its Brand KB setup. With `notice`, the KB page
 * shows a toast saying why (Scripts and Avatars, reached from the home tile's buttons); the
 * client's own page leaves it off, since opening a new client's KB is the expected first step.
 */
export function redirectUnlessKbReady(
  client: Pick<ClientRow, "kb_status" | "slug">,
  { notice = true }: { notice?: boolean } = {},
): void {
  if (isKbReady(client)) return;
  const query = notice ? `?${KB_REQUIRED_PARAM}=${KB_REQUIRED_VALUE}` : "";
  redirect(`/clients/${client.slug}/kb${query}`);
}
