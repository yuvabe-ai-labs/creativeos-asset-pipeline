import { NO_ON_SCREEN_TEXT_LINE, soundDesignClause } from "./compose-omni-prompt";

/**
 * D443/D445 — the lines every video request carries around its prompt, in one place.
 *
 * - The reference roles line (`referenceRolesLine`) leads, so the model reads what each image is
 *   before the shots that use them. On Omni the `[# References …]` header still comes first:
 *   composeOmniPrompt prepends it to whatever this returns.
 * - "No on-screen text." Omni already gets it from composeOmniPrompt. Kling and Seedance never
 *   did, so both invented captions and packaging copy. On Kling it LEADS: anything after the last
 *   `shot n, s, text;` triple risks being read as part of the final shot (D238). On Seedance it
 *   closes the prompt, where its own guide puts constraints.
 */
export function withRequestLines(
  prompt: string,
  args: { provider: string | undefined; rolesLine: string },
): string {
  // D472 — Kling and Seedance make sound by default too, so they get the same sound clause Omni
  // does (composeOmniPrompt adds Omni's): who speaks, or that nobody does.
  const sound = soundDesignClause(prompt);
  const parts =
    args.provider === "kling"
      ? [args.rolesLine, NO_ON_SCREEN_TEXT_LINE, sound, prompt]
      : args.provider === "seedance"
        ? [args.rolesLine, prompt, NO_ON_SCREEN_TEXT_LINE, sound]
        : [args.rolesLine, prompt];
  return parts.filter((p) => p.trim()).join("\n\n");
}
