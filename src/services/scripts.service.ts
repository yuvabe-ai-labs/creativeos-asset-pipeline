import type { Script } from "@/lib/scripts/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
import { readJson } from "./read-json";

class ScriptsService {
  async list(clientId: string, stage?: ScriptStage): Promise<Script[]> {
    const qs = stage ? `?stage=${stage}` : "";
    const res = await fetch(`/api/clients/${clientId}/scripts${qs}`);
    return (await readJson<{ scripts: Script[] }>(res, "Could not load the scripts.")).scripts;
  }

  async get(clientId: string, scriptId: string): Promise<{ script: Script; leadAvatarId: string | null }> {
    const res = await fetch(`/api/clients/${clientId}/scripts/${scriptId}`);
    return readJson<{ script: Script; leadAvatarId: string | null }>(res, "Could not load the script.");
  }
}

export const scriptsService = new ScriptsService();
