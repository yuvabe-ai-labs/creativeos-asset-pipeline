import { NextRequest } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export type DriveFileItem = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl: string;
  modifiedTime: string;
  isFolder: boolean;
};

export type DriveFilesResponse = {
  files: DriveFileItem[];
  nextPageToken: string | null;
};

const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const FOLDER_MIME = "application/vnd.google-apps.folder";

// "shared-with-me" is a virtual root — not a real Drive folder ID.
const SHARED_WITH_ME_ID = "shared-with-me";

async function queryDrive(
  q: string,
  fields: string,
  accessToken: string,
  pageToken?: string,
  pageSize = 48,
): Promise<{
  items: Array<{ id: string; name: string; mimeType: string; thumbnailLink?: string; modifiedTime: string }>;
  nextPageToken?: string;
}> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", fields);
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("orderBy", "name");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    files?: Array<{ id: string; name: string; mimeType: string; thumbnailLink?: string; modifiedTime: string }>;
    nextPageToken?: string;
  };

  return { items: json.files ?? [], nextPageToken: json.nextPageToken };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId") ?? "root";
  const pageToken = searchParams.get("pageToken") ?? undefined;

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive. Check server configuration.", 500);
  }

  try {
    let folders: DriveFileItem[] = [];
    let images: DriveFileItem[] = [];
    let nextPageToken: string | null = null;

    if (folderId === SHARED_WITH_ME_ID) {
      // "Shared with me" — virtual root listing shared images + folders
      const mimeFilter = [...IMAGE_MIME_TYPES.map((m) => `mimeType='${m}'`), `mimeType='${FOLDER_MIME}'`].join(" or ");
      const q = `sharedWithMe=true and (${mimeFilter}) and trashed=false`;
      const result = await queryDrive(
        q,
        "nextPageToken,files(id,name,mimeType,thumbnailLink,modifiedTime)",
        accessToken,
        pageToken,
      );

      for (const f of result.items) {
        const item: DriveFileItem = {
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          thumbnailUrl: f.mimeType === FOLDER_MIME ? "" : `/api/drive/thumbnail/${f.id}`,
          modifiedTime: f.modifiedTime,
          isFolder: f.mimeType === FOLDER_MIME,
        };
        if (f.mimeType === FOLDER_MIME) {
          folders.push(item);
        } else {
          images.push(item);
        }
      }
      nextPageToken = result.nextPageToken ?? null;
    } else {
      // Regular folder — fetch sub-folders and images in parallel
      const parentQ = `'${folderId}' in parents and trashed=false`;
      const folderQ = `${parentQ} and mimeType='${FOLDER_MIME}'`;
      const imageQ = `${parentQ} and (${IMAGE_MIME_TYPES.map((m) => `mimeType='${m}'`).join(" or ")})`;

      const [folderResult, imageResult] = await Promise.all([
        queryDrive(folderQ, "files(id,name,mimeType,modifiedTime)", accessToken, undefined, 50),
        queryDrive(
          imageQ,
          "nextPageToken,files(id,name,mimeType,thumbnailLink,modifiedTime)",
          accessToken,
          pageToken,
        ),
      ]);

      folders = folderResult.items.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        thumbnailUrl: "",
        modifiedTime: f.modifiedTime,
        isFolder: true,
      }));

      images = imageResult.items.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        thumbnailUrl: `/api/drive/thumbnail/${f.id}`,
        modifiedTime: f.modifiedTime,
        isFolder: false,
      }));

      nextPageToken = imageResult.nextPageToken ?? null;
    }

    return apiOk<DriveFilesResponse>({
      files: [...folders, ...images],
      nextPageToken,
    });
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Drive API error", 502);
  }
}
