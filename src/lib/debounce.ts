// Trailing-edge debounce — matches the hand-rolled pattern every other debounced thing in this
// codebase already uses (canvas-autosave.tsx, use-drive-browser.ts), extracted as a pure,
// testable factory since no shared debounce utility exists anywhere in this repo.
export function createDebounced<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): { call: (...args: A) => void; flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: A | null = null;

  function call(...args: A) {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const toRun = pendingArgs;
      pendingArgs = null;
      if (toRun) fn(...toRun);
    }, delayMs);
  }

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    const toRun = pendingArgs;
    pendingArgs = null;
    if (toRun) fn(...toRun);
  }

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  }

  return { call, flush, cancel };
}
