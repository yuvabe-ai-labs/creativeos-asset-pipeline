import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { addClientVoice } from "@/lib/db/client-voices";
import { cloneVoice } from "@/lib/elevenlabs/voice-catalog";
import { getVoiceCached, invalidateAccountVoices } from "@/lib/elevenlabs/voices-cache";
import { validateVoiceCloneInput } from "@/lib/elevenlabs/client-voices";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";

export const dynamic = "force-dynamic";
// Cloning uploads the audio to ElevenLabs and waits for the voice to be created.
export const maxDuration = 120;

// POST /api/clients/:id/voices/clone — Instant Voice Clone for this client (D292). Multipart:
// `name`, `files` (one or more), optional `description`, `removeBackgroundNoise`, and `consent`,
// which must be "true". The voice is named "<client> · <name>" on the shared ElevenLabs account
// so it can be traced back, and recorded for the client.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId, client) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError("Invalid form data.", 400);
    }
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    const invalid = validateVoiceCloneInput({
      name,
      consent: form.get("consent") === "true",
      files: files.map((f) => ({ name: f.name, size: f.size })),
    });
    if (invalid) return apiError(invalid, 400);

    try {
      const caller = await resolveCallerContext();
      const voiceId = await cloneVoice({
        name: `${client.name} · ${name}`,
        ...(description ? { description } : {}),
        removeBackgroundNoise: form.get("removeBackgroundNoise") === "true",
        files: await Promise.all(
          files.map(async (f) => ({ name: f.name, type: f.type, bytes: await f.arrayBuffer() })),
        ),
      });
      // Recorded before the lookup: if the lookup below fails, the voice still belongs to the
      // client and shows up under "This client" on the next load rather than being orphaned.
      await addClientVoice({ clientId, voiceId, name, source: "clone", userId: caller.userId });
      invalidateAccountVoices(voiceId);
      const voice = await getVoiceCached(voiceId);
      if (!voice) {
        return apiError("The voice was cloned but isn't on the account yet. Reopen the picker in a moment.", 502);
      }
      return apiOk({ voice }, 201);
    } catch (e) {
      return elevenLabsRouteError(e);
    }
  });
}
