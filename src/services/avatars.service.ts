import { readImageSize, uploadViaSignedUrl } from "@/lib/uploads/client";
import type { Avatar, AvatarImageSlot } from "@/lib/avatars/schema";
import { avatarImageContentType, type AvatarUpdateInput } from "@/lib/avatars/utils";
import { readJson } from "./read-json";

const JSON_HEADERS = { "Content-Type": "application/json" };

class AvatarsService {
  async list(clientId: string): Promise<Avatar[]> {
    const res = await fetch(`/api/clients/${clientId}/avatars`);
    return (await readJson<{ avatars: Avatar[] }>(res, "Could not load the avatars.")).avatars;
  }

  async create(clientId: string, fields: { name?: string; story?: string }): Promise<Avatar> {
    const res = await fetch(`/api/clients/${clientId}/avatars`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(fields),
    });
    return (await readJson<{ avatar: Avatar }>(res, "Could not create the avatar.")).avatar;
  }

  async update(clientId: string, avatarId: string, input: AvatarUpdateInput): Promise<Avatar> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}`, {
      method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(input),
    });
    return (await readJson<{ avatar: Avatar }>(res, "Could not save the avatar.")).avatar;
  }

  async archive(clientId: string, avatarId: string): Promise<void> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}`, { method: "DELETE" });
    await readJson(res, "Could not archive the avatar.");
  }

  /** Signs, PUTs straight to GCS, then records the image — the flow Brand Kit uses. */
  async uploadImage(
    clientId: string,
    avatarId: string,
    slot: AvatarImageSlot,
    file: File,
  ): Promise<Avatar> {
    const base = `/api/clients/${clientId}/avatars/${avatarId}/images`;
    const { avatar } = await uploadViaSignedUrl<{ avatar: Avatar }>(file, {
      signEndpoint: `${base}/sign`,
      finalizeEndpoint: base,
      signBody: { slot },
      finalizeBody: { slot, ...(await readImageSize(file)) },
      contentType: avatarImageContentType(file),
    });
    return avatar;
  }
}

export const avatarsService = new AvatarsService();
