import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar } from "@/lib/db/avatars";
import { listAvatarGenerations, sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { buildAvatarFrontPrompt } from "@/lib/avatars/generation";
import { generationToCandidate } from "@/lib/avatars/rows";
import {
  AVATAR_DESCRIPTION_MAX, AVATAR_FRONT_ASPECT, AVATAR_STYLES,
} from "@/lib/avatars/constants";
import type { AvatarCandidate } from "@/lib/avatars/schema";

// One image can take over a minute on some models.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; avatarId: string }> };

const STYLE_IDS = AVATAR_STYLES.map((s) => s.id) as [string, ...string[]];

const GenerateSchema = z.object({
  description: z.string().trim().min(1).max(AVATAR_DESCRIPTION_MAX),
  attributes: z
    .object({ gender: z.string().max(40), age: z.string().max(40), ethnicity: z.string().max(40) })
    .partial()
    .optional(),
  styleId: z.enum(STYLE_IDS),
  modelId: z.string().min(1),
  // Groups the images of one Generate click. Minted in the browser, so a batch is known
  // before its first image returns.
  batchId: z.string().min(1).max(64),
});

// GET …/generations — the front candidates generated so far, newest first, and what this
// avatar's images have cost (the ledger's settled amounts, not an estimate).
export async function GET(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the generated images.", async () => {
      const avatar = await getAvatar(clientId, avatarId);
      if (!avatar) return apiError("Avatar not found.", 404);
      const [rows, spentCredits] = await Promise.all([
        listAvatarGenerations(avatarId),
        sumAvatarCredits(avatarId),
      ]);
      const candidates = rows
        .map(generationToCandidate)
        .filter((c): c is AvatarCandidate => c !== null);
      return apiOk({ candidates, spentCredits });
    }),
  );
}

// POST …/generations — generate ONE front candidate. The browser sends one request per image
// in a batch, so each image has its own reservation, its own failure, and its own placeholder.
// Not wrapped in withTryCatch: a CreditLimitError must answer 402 (the credit-cap toast), and
// withTryCatch's catch-all would turn it into an undifferentiated 500 instead.
export async function POST(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId, client) => {
    const parsed = GenerateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Describe the character and choose a style and model.", 400);
    const { description, attributes, styleId, modelId, batchId } = parsed.data;

    const avatar = await getAvatar(clientId, avatarId);
    if (!avatar || avatar.archivedAt) return apiError("Avatar not found.", 404);

    const caller = await resolveCallerContext();
    try {
      const { generation, creditsCharged } = await runAvatarGeneration({
        clientId,
        avatarId,
        orgId: client.org_id,
        userId: caller.userId,
        userEmail: caller.email,
        slot: "front",
        modelId,
        aspect: AVATAR_FRONT_ASPECT,
        prompt: buildAvatarFrontPrompt({
          description,
          attributes: attributes ?? {},
          styleId: styleId as (typeof AVATAR_STYLES)[number]["id"],
        }),
        referenceUrls: [],
        batchId,
      });
      const candidate = generationToCandidate(generation);
      if (!candidate) return apiError("The image was generated but could not be read back.", 500);
      return apiOk({ candidate, creditsCharged }, 201);
    } catch (e) {
      if (e instanceof CreditLimitError) return apiError(CREDIT_LIMIT_TOAST_MESSAGE, 402);
      return apiError(e instanceof Error ? e.message : "Image generation failed", 500);
    }
  });
}
