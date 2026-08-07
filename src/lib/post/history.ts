// Generic undo/redo stack. Callers decide WHEN a gesture ends and call commit() exactly
// once for it (pointerup after a drag/resize/rotate, blur after a text edit, immediately
// for a discrete action like add/delete/duplicate) — never per intermediate pointermove.
// This is the resolved answer to the open question in post-node-design.md §17: a naive
// per-mutation history would make a single drag take twenty undos to reverse.
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] };
}

export function commit<T>(history: History<T>, next: T): History<T> {
  if (next === history.present) return history;
  return { past: [...history.past, history.present], present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  const [next, ...rest] = history.future;
  return { past: [...history.past, history.present], present: next, future: rest };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}
