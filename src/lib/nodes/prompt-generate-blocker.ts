/**
 * Why a prompt node's Generate (the image Prompt and the Motion Prompt) is unavailable, when that
 * needs SAYING — the prompt-node counterpart of imageGenerateBlocker. Disabling is still decided by
 * imageGenerateDisabled, which also holds the button while generating and while the inputs load.
 *
 * Generate is held until the inputs are ready: the server writes from PERSISTED, resolved inputs
 * (compile-preview / generate both run the same resolver), so a click before that read lands could
 * miss a just-wired input, and a wired input with nothing in it yet adds nothing to the prompt.
 */
export function promptGenerateBlocker(input: {
  editable: boolean;
  /** The view is still saving and resolving its inputs. */
  loadingInputs: boolean;
  /** What is wired in, as the canvas lists it. */
  wired: ReadonlyArray<{ id: string; label: string }>;
  /** Each input as the server resolved it. An input missing here (the read failed) is unknown,
   *  never "empty": the server still decides for it. */
  resolved: ReadonlyArray<{ nodeId: string; text: string; fileUrl?: string; useLlm?: boolean }>;
  instruction: string;
}): string | null {
  const { editable, loadingInputs, wired, resolved, instruction } = input;
  if (!editable) return "This canvas is read-only.";
  if (loadingInputs) return "Loading the connected inputs…";
  if (wired.length === 0 && !instruction.trim()) {
    return "Connect an input, or write an instruction, to generate.";
  }
  const empty = wired.flatMap((u) => {
    const r = resolved.find((c) => c.nodeId === u.id);
    return r && !r.text.trim() && !r.fileUrl ? [{ label: u.label, useLlm: r.useLlm }] : [];
  });
  if (empty.length === 1) {
    return empty[0].useLlm
      ? `Run extraction in ${empty[0].label} first.`
      : `${empty[0].label} has no content yet. Add it at that node first.`;
  }
  if (empty.length > 1) return `${empty.length} connected inputs have no content yet.`;
  return null;
}
