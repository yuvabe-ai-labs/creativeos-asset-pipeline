import { NextRequest } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export type DriveImageItem = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl: string;
  previewUrl: string;
  modifiedTime: string;
  ownedByMe: boolean;
  isShared: boolean;
  parentFolder: { id: string; name: string } | null;
};

export type DriveImagesResponse = {
  items: DriveImageItem[];
  nextPageToken: string | null;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  ownedByMe?: boolean;
  shared?: boolean;
  parents?: string[];
};

async function fetchFolderMeta(
  folderId: string,
  accessToken: string,
): Promise<{ id: string; name: string } | null> {
  const url = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { id: string; name: string };
  return { id: json.id, name: json.name };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pageToken = searchParams.get("pageToken") ?? undefined;

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive. Check server configuration.", 500);
  }

  // Query all image files visible to the user across My Drive + Shared with me
  // + any shared drives they can read. The membership clause explicitly names
  // 'me' in owners/readers/writers so we don't miss files that were shared
  // directly (which don't always match under a bare mime filter).
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set(
    "q",
    "(mimeType contains 'image/') and trashed=false and ('me' in owners or 'me' in readers or 'me' in writers or sharedWithMe=true)",
  );
  url.searchParams.set(
    "fields",
    "nextPageToken,files(id,name,mimeType,modifiedTime,ownedByMe,shared,parents)",
  );
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const listRes = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const text = await listRes.text();
    return apiError(`Drive API error: ${text}`, listRes.status);
  }

  const listJson = (await listRes.json()) as {
    files?: DriveFile[];
    nextPageToken?: string;
  };
  const files = listJson.files ?? [];

  // Batch + dedupe parent folder lookups.
  const parentIds = new Set<string>();
  for (const f of files) {
    const first = f.parents?.[0];
    if (first) parentIds.add(first);
  }
  const folderPromises = new Map<string, Promise<{ id: string; name: string } | null>>();
  for (const pid of parentIds) {
    folderPromises.set(pid, fetchFolderMeta(pid, accessToken));
  }
  const folderEntries = await Promise.all(
    Array.from(folderPromises.entries()).map(async ([id, p]) => [id, await p] as const),
  );
  const folderMap = new Map(folderEntries);

  const items: DriveImageItem[] = files.map((f) => {
    const parentId = f.parents?.[0];
    const parentFolder = parentId ? folderMap.get(parentId) ?? null : null;
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      thumbnailUrl: `/api/drive/thumbnail/${f.id}`,
      previewUrl: `/api/drive/file/${f.id}`,
      modifiedTime: f.modifiedTime,
      ownedByMe: f.ownedByMe ?? true,
      isShared: !(f.ownedByMe ?? true) || (f.shared ?? false),
      parentFolder,
    };
  });

  return apiOk<DriveImagesResponse>({
    items,
    nextPageToken: listJson.nextPageToken ?? null,
  });
}
