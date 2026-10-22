import type { Script } from "@/lib/scripts/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
import type { StoryboardPanel } from "@/lib/scripts/storyboard";
import { readJson } from "./read-json";

type ScriptDetail = { script: Script; leadAvatarId: string | null; storyboard: StoryboardPanel[] };

class ScriptsService {
  async list(clientId: string, stage?: ScriptStage): Promise<Script[]> {
    const qs = stage ? `?stage=${stage}` : "";
    const res = await fetch(`/api/clients/${clientId}/scripts${qs}`);
    return (await readJson<{ scripts: Script[] }>(res, "Could not load the scripts.")).scripts;
  }

  async get(clientId: string, scriptId: string): Promise<ScriptDetail> {
    const res = await fetch(`/api/clients/${clientId}/scripts/${scriptId}`);
    return readJson<ScriptDetail>(res, "Could not load the script.");
  }
}

export const scriptsService = new ScriptsService();
