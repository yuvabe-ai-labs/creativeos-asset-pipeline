"use client";

import { useCallback, useState } from "react";
import { useFollowCopilot } from "@/hooks/use-follow-copilot";
import { fieldsWrittenSince, kbFieldPath, kbTarget } from "@/lib/journey/kb-copilot/targets";
import type { ModuleKey } from "@/lib/kb/types";
import { fieldLocation, getFieldPath } from "@/lib/kb/utils";

/** The brand KB review page following the copilot (D508): a review field is reached by switching to
 *  its tab; Image Analysis and unknown fields cannot be shown. `takeWritten` gives the fields the
 *  copilot wrote since the page last took in the stored KB (spec §3.2), and is called once per take. */
export function useKbReviewFollow(clientId: string, showModule: (module: ModuleKey) => void) {
  const reveal = useCallback((target: string) => {
    const path = kbFieldPath(target);
    const location = path ? fieldLocation(path) : null;
    if (!location) return false;
    showModule(location.module);
    return true;
  }, [showModule]);
  const { stateOf, written } = useFollowCopilot(clientId, reveal);

  const [takenUpTo, setTakenUpTo] = useState(() => written.at(-1)?.n ?? 0);
  /** Called while rendering, on a change of the stored KB (it sets this component's own state). */
  const takeWritten = (): Set<string> => {
    const { paths, latest } = fieldsWrittenSince(written, takenUpTo);
    if (latest !== takenUpTo) setTakenUpTo(latest);
    return paths;
  };

  const fieldTarget = (module: ModuleKey, fieldKey: string) => kbTarget.field(getFieldPath(module, fieldKey).join("."));
  return { stateOf, takeWritten, fieldTarget };
}
