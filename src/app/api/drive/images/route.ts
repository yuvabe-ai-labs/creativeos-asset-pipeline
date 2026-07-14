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

type PageCursor = {
  ownedToken?: string;
  sharedToken?: string;
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

async function queryImages(
  q: string,
  pageToken: string | undefined,
  accessToken: string,
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set(
    "fields",
    "nextPageToken,files(id,name,mimeType,modifiedTime,ownedByMe,shared,parents)",
  );
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API error (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    files?: DriveFile[];
    nextPageToken?: string;
  };
  return { files: json.files ?? [], nextPageToken: json.nextPageToken };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cursorParam = searchParams.get("pageToken");

  // Cursor encoding: base64(JSON({ ownedToken, sharedToken })).
  // First page = no cursor. Subsequent pages carry both.
  let cursor: PageCursor = {};
  if (cursorParam) {
    try {
      cursor = JSON.parse(Buffer.from(cursorParam, "base64").toString("utf-8"));
    } catch {
      return apiError("Invalid pageToken", 400);
    }
  }

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive. Check server configuration.", 500);
  }

  // Two parallel queries: owned images + shared-with-me images. Google's
  // documented approach — a single OR combining sharedWithMe with owner
  // predicates returns incomplete results across large collections.
  const OWNED_Q = "mimeType contains 'image/' and trashed=false and 'me' in owners";
  const SHARED_Q = "mimeType contains 'image/' and trashed=false and sharedWithMe=true";

  // On the first page (no cursor), fetch both. On subsequent pages, only fetch
  // the corpora that still have a nextPageToken.
  const firstPage = !cursorParam;
  const ownedPromise =
    firstPage || cursor.ownedToken
      ? queryImages(OWNED_Q, cursor.ownedToken, accessToken)
      : Promise.resolve({ files: [] as DriveFile[], nextPageToken: undefined });
  const sharedPromise =
    firstPage || cursor.sharedToken
      ? queryImages(SHARED_Q, cursor.sharedToken, accessToken)
      : Promise.resolve({ files: [] as DriveFile[], nextPageToken: undefined });

  let ownedRes;
  let sharedRes;
  try {
    [ownedRes, sharedRes] = await Promise.all([ownedPromise, sharedPromise]);
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Drive API error",
      502,
    );
  }

  // Merge + dedupe by id + sort by modifiedTime desc.
  const merged = new Map<string, DriveFile>();
  for (const f of [...ownedRes.files, ...sharedRes.files]) {
    if (!merged.has(f.id)) merged.set(f.id, f);
  }
  const files = Array.from(merged.values()).sort((a, b) =>
    b.modifiedTime.localeCompare(a.modifiedTime),
  );

  // Batch + dedupe parent folder lookups.
  const parentIds = new Set<string>();
  for (const f of files) {
    const first = f.parents?.[0];
    if (first) parentIds.add(first);
  }
  const folderEntries = await Promise.all(
    Array.from(parentIds).map(async (id) => [id, await fetchFolderMeta(id, accessToken)] as const),
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

  // Encode the next-page cursor. Null when both corpora are exhausted.
  const nextCursor: PageCursor = {
    ownedToken: ownedRes.nextPageToken,
    sharedToken: sharedRes.nextPageToken,
  };
  const hasMore = !!(nextCursor.ownedToken || nextCursor.sharedToken);
  const nextPageToken = hasMore
    ? Buffer.from(JSON.stringify(nextCursor)).toString("base64")
    : null;

  return apiOk<DriveImagesResponse>({ items, nextPageToken });
}
