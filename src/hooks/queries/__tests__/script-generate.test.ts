import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateState } from "@/lib/scripts/copilot/schema";
import { landGenerateState } from "../script-generate";
import { scriptKeys } from "../scripts";
import { visualiseKeys } from "../visualise";

const state = (stage: GenerateState["script"]["stage"]): GenerateState => ({
  script: { id: "s1", clientId: "c1", stage, doc: null, brief: EMPTY_BRIEF, notes: EMPTY_NOTES, docVersion: 1, createdAt: "t", updatedAt: "t" },
  messages: [], openItems: [], avatars: [], formats: [],
});

describe("landGenerateState", () => {
  it("puts the thread in the cache and, at Visualise, re-reads the board the copilot may have changed", () => {
    const qc = new QueryClient();
    qc.setQueryData(visualiseKeys.board("c1", "s1"), { script: {}, board: {} });
    landGenerateState(qc, "c1", "s1", state("visualise"));
    expect(qc.getQueryData(scriptKeys.generate("c1", "s1"))).toEqual(state("visualise"));
    expect(qc.getQueryState(visualiseKeys.board("c1", "s1"))?.isInvalidated).toBe(true);
  });

  it("leaves the board alone at Generate", () => {
    const qc = new QueryClient();
    qc.setQueryData(visualiseKeys.board("c1", "s1"), { script: {}, board: {} });
    landGenerateState(qc, "c1", "s1", state("generate"));
    expect(qc.getQueryState(visualiseKeys.board("c1", "s1"))?.isInvalidated).toBe(false);
  });
});
