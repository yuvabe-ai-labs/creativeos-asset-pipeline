import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { patchBrandDetails } from "@/lib/db/brand-kit";
import { BRAND_DETAIL_FIELDS } from "@/lib/brand-kit/constants";
import type { BrandDetails } from "@/lib/brand-kit/types";

const ALLOWED = new Set<string>(BRAND_DETAIL_FIELDS.map((f) => f.key));

/** Generous for a postal address, nowhere near enough to be worth abusing. */
const MAX_DETAIL_LENGTH = 300;

// PATCH /api/clients/:id/brand-kit/details — merge the given keys into brand_details.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not save the detail.", async () => {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== "object") {
        return apiError("A JSON body is required.", 400);
      }

      // Allow-listed rather than passed through: this writes into a JSONB column, so an
      // unfiltered spread would let any caller store arbitrary keys on the client row.
      const patch: BrandDetails = {};
      for (const [key, value] of Object.entries(body)) {
        if (!ALLOWED.has(key)) continue;
        if (typeof value !== "string") continue;
        // Bounded: these land in a JSONB column read whole on every panel load, and the
        // longest legitimate value here is a postal address. Without a cap a caller could
        // push megabytes into the client row seven keys at a time.
        if (value.length > MAX_DETAIL_LENGTH) {
          return apiError(
            `That value is too long — keep it under ${MAX_DETAIL_LENGTH} characters.`,
            400,
          );
        }
        (patch as Record<string, string>)[key] = value.trim();
      }

      const details = await patchBrandDetails(clientId, patch);
      return apiOk({ details });
    }),
  );
}
