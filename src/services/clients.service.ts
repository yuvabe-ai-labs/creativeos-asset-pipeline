import { uploadViaSignedUrl } from "@/lib/uploads/client";
import { readJson } from "./read-json";

class ClientsService {
  /** Renames the client; its slug (and so every URL) stays the same. */
  async rename(clientId: string, name: string): Promise<string> {
    const res = await fetch(`/api/clients/${clientId}/name`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return (await readJson<{ name: string }>(res, "Could not rename the client.")).name;
  }

  /** Uploads straight to storage, then records it as the client's logo — the New client flow. */
  async uploadLogo(clientId: string, file: File): Promise<string> {
    const { logoUrl } = await uploadViaSignedUrl<{ logoUrl: string }>(file, {
      signEndpoint: `/api/clients/${clientId}/logo/sign`,
      finalizeEndpoint: `/api/clients/${clientId}/logo/finalize`,
    });
    return logoUrl;
  }

  /** A person approves the client's market research, which opens new scripts. */
  async approveMarket(clientId: string): Promise<void> {
    const res = await fetch(`/api/clients/${clientId}/market/approve`, { method: "POST" });
    await readJson<{ ok: true }>(res, "Could not approve market research.");
  }
}

export const clientsService = new ClientsService();
