import { readImageSize, uploadViaSignedUrl } from "@/lib/uploads/client";
import type { Avatar, AvatarCandidate, AvatarImageSlot } from "@/lib/avatars/schema";
import { avatarImageContentType, type AvatarUpdateInput } from "@/lib/avatars/utils";
import type { AvatarAttributes, AvatarStyleId } from "@/lib/avatars/constants";
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

  /** Reloads the avatar's real, current state — used after a write is refused because the
   *  screen was showing a photo that had already changed underneath it. */
  async get(clientId: string, avatarId: string): Promise<Avatar> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}`);
    return (await readJson<{ avatar: Avatar }>(res, "Could not load the avatar.")).avatar;
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

  async listGenerations(
    clientId: string,
    avatarId: string,
  ): Promise<{ candidates: AvatarCandidate[]; spentCredits: number }> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}/generations`);
    return readJson(res, "Could not load the generated images.");
  }

  /** ONE front candidate. The Studio calls this once per image in a batch. */
  async generateFront(
    clientId: string,
    avatarId: string,
    body: {
      description: string;
      attributes: AvatarAttributes;
      styleId: AvatarStyleId;
      modelId: string;
      batchId: string;
    },
  ): Promise<{ candidate: AvatarCandidate; creditsCharged: number; spentCredits: number | null }> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}/generations`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body),
    });
    return readJson(res, "Could not generate the image.");
  }

  async pickFront(clientId: string, avatarId: string, generationId: string): Promise<Avatar> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}/front`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ generationId }),
    });
    return (await readJson<{ avatar: Avatar }>(res, "Could not set the front image.")).avatar;
  }

  async generateSheet(
    clientId: string,
    avatarId: string,
    modelId: string,
  ): Promise<{ avatar: Avatar; creditsCharged: number; spentCredits: number | null }> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}/sheet`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ modelId }),
    });
    return readJson(res, "Could not generate the profile sheet.");
  }
}

export const avatarsService = new AvatarsService();
