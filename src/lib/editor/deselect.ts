// Clicking empty space clears the selection, as in desktop editors (D414). Pure DOM test, so the
// shell needs one handler for the whole page instead of one per panel.

/** What a click keeps the selection for: the selected things themselves, the inspector, and any
 *  control (Delete and Split act on the selection, so pressing them must not clear it first). */
export const KEEPS_SELECTION =
  '[data-keep-selection], button, a, input, textarea, [role="button"], [role="slider"], [role="tab"], [role="separator"], [role="menuitem"], [role="option"], [role="combobox"], [role="switch"]';

/** True when a primary-button press at `target`, inside `root`, should clear the selection.
 *  Presses in pop-ups (menus, dropdowns) render outside `root` and never clear it. */
export function clearsSelection(root: Element, target: EventTarget | null, button: number): boolean {
  if (button !== 0 || !(target instanceof Element) || !root.contains(target)) return false;
  return target.closest(KEEPS_SELECTION) === null;
}
