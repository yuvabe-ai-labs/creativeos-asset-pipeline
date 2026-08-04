import { updateClientWebsiteUrl } from "@/lib/db/clients";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";

function normalizeUrl(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) => {
    return withTryCatch("Failed to save website URL", async () => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError("Invalid JSON body.", 400);
      }
      const raw = (body as { websiteUrl?: unknown } | null)?.websiteUrl;
      const url = normalizeUrl(raw);
      await updateClientWebsiteUrl(clientId, url);
      return apiOk({ websiteUrl: url });
    });
  });
}
