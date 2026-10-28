import type { GenerateState } from "./schema";

// The copilot's chips are not stored (user, 28 Oct 2026, "for now"): the turn's answer carries them
// on its newest reply, and the browser keeps them for the session, so typing, an inline edit or a
// settled card (each of which returns the state fresh from the server) does not clear them. A
// reload does, until the next message.

/** The state with the turn's chips on its newest copilot reply. */
export function withReplyChips(state: GenerateState, chips: string[]): GenerateState {
  if (chips.length === 0) return state;
  const at = state.messages.findLastIndex((m) => m.role === "assistant");
  if (at < 0) return state;
  return { ...state, messages: state.messages.map((m, i) => (i === at ? { ...m, suggestions: chips } : m)) };
}

/** `next` (fresh from the server, without chips) with the chips the browser already holds, by message. */
export function keepChips(held: GenerateState | undefined, next: GenerateState): GenerateState {
  if (!held) return next;
  const chips = new Map(held.messages.filter((m) => m.suggestions.length).map((m) => [m.id, m.suggestions]));
  if (chips.size === 0) return next;
  return {
    ...next,
    messages: next.messages.map((m) => (m.suggestions.length || !chips.has(m.id) ? m : { ...m, suggestions: chips.get(m.id)! })),
  };
}
