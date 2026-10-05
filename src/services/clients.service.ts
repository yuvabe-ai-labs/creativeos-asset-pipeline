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
}

export const clientsService = new ClientsService();
