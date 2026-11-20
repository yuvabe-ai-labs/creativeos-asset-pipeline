/** Brings a part of the board the copilot names into view (its CopilotTarget, D508). */
export function showOnBoard(target: string): void {
  document.querySelector(`[data-copilot-target="${CSS.escape(target)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}
