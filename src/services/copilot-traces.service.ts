import type { TurnLine, TurnTrace } from "@/lib/journey/kb-copilot/trace";
import { readJson } from "./read-json";

// Copilot turn traces (D509): the lines of a client's recent turns, and one turn's whole trace.
class CopilotTracesService {
  async lines(clientId: string): Promise<TurnLine[]> {
    const res = await fetch(`/api/clients/${clientId}/copilot/traces`);
    return (await readJson<{ lines: TurnLine[] }>(res, "The turns could not be loaded.")).lines;
  }

  async trace(clientId: string, traceId: string): Promise<TurnLine & { trace: TurnTrace }> {
    const res = await fetch(`/api/clients/${clientId}/copilot/traces/${traceId}`);
    return readJson<TurnLine & { trace: TurnTrace }>(res, "The trace could not be loaded.");
  }
}

export const copilotTracesService = new CopilotTracesService();
