// The editor's autosave (D390), free of React so its rules are tested:
// - saves 800 ms after the last change, and never when nothing changed since the last save (rule 4);
// - flush() saves now and REJECTS when the save fails, so leaving the page or exporting stops
//   instead of going ahead on an edit the server doesn't have;
// - a network or server failure retries every 5 s in the background; a 409 (another session took
//   the lock) and a 400 (the server refuses this edit) are final and never retried;
// - dispose() sends what is still pending, so leaving by the browser's Back loses nothing.
import { ApiError } from "@/services/read-json";
import type { EditDoc } from "./types";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export class SaveFailure extends Error {
  constructor(message: string, readonly final: boolean) {
    super(message);
    this.name = "SaveFailure";
  }
}

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

type Deps = {
  read(): { doc: EditDoc; editable: boolean };
  save(doc: EditDoc): Promise<void>;
  onStatus(status: SaveStatus): void;
  onLockLost(): void;
  initiallyDirty: boolean;
};

export function createAutosaver(deps: Deps) {
  let lastSaved = deps.initiallyDirty ? "" : JSON.stringify(deps.read().doc);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let stopped = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const isDirty = () => JSON.stringify(deps.read().doc) !== lastSaved;

  const saveNow = async (): Promise<void> => {
    const { doc, editable } = deps.read();
    if (!editable) return;
    const json = JSON.stringify(doc);
    if (json === lastSaved) {
      deps.onStatus("saved");
      return;
    }
    deps.onStatus("saving");
    try {
      await deps.save(doc);
      lastSaved = json;
      deps.onStatus(isDirty() ? "unsaved" : "saved");
    } catch (err) {
      deps.onStatus("error");
      const status = err instanceof ApiError ? err.status : 0;
      const message = err instanceof Error ? err.message : "Couldn't save the edit.";
      if (status === 409) {
        deps.onLockLost();
        throw new SaveFailure(message, true);
      }
      if (status === 400) throw new SaveFailure(message, true);
      if (!stopped) timer = setTimeout(() => void flush().catch(() => {}), RETRY_MS);
      throw new SaveFailure(message, false);
    }
  };

  /** Saves now; rejects with SaveFailure when the save didn't happen. */
  function flush(): Promise<void> {
    clear();
    const run = chain.then(saveNow);
    chain = run.catch(() => {});
    return run;
  }

  return {
    flush,
    isDirty,
    /** A change happened: save after a pause. */
    schedule() {
      clear();
      deps.onStatus("unsaved");
      timer = setTimeout(() => void flush().catch(() => {}), DEBOUNCE_MS);
    },
    /** The page is going away: send what is pending, and stop retrying. */
    dispose() {
      stopped = true;
      const pending = timer !== null || isDirty();
      clear();
      if (pending) void flush().catch(() => {});
    },
  };
}
