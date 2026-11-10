// D483 — what Omni's edit task is sent. References are addressed as <IMAGE_REF_n>, in the order
// the image parts follow the video in the request (verified on the live API, November 2026).
const KEEP_LINE =
  "Change only what is described above. Keep everything else exactly as it is: the people, their faces and clothes, the products, the setting, the lighting, the camera movement and the timing.";

export function composeVideoEditPrompt(a: { instruction: string; references: { label: string }[] }): string {
  const parts = [a.instruction.trim()];
  if (a.references.length > 0) {
    parts.push(a.references.map((r, i) => `<IMAGE_REF_${i}> is ${r.label}.`).join(" "));
  }
  parts.push(KEEP_LINE);
  return parts.join("\n\n");
}
