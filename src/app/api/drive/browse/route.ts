import { NextRequest } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, apiOk } from "@/lib/api/route-helpers";

const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  thumbnailLink?: string;
};

function escapeDriveLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export type DriveBrowseItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
};

export type DriveBrowseResponse = {
  items: DriveBrowseItem[];
  nextPageToken: string | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId");
  const search = (searchParams.get("q") ?? "").trim();
  const pageToken = searchParams.get("pageToken") ?? undefined;

  if (!folderId) return apiError("folderId is required.", 400);

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive.", 500);
  }

  const searchQ = search
    ? ` and name contains '${escapeDriveLiteral(search)}'`
    : "";

  const q =
    `'${escapeDriveLiteral(folderId)}' in parents and trashed=false` +
    `${searchQ}`;

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set(
    "fields",
    "nextPageToken,files(id,name,mimeType,modifiedTime,thumbnailLink)",
  );
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("orderBy", "folder,modifiedTime desc");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 404) return apiError("folder_not_found", 404);
    const text = await res.text();
    return apiError(`Drive API error (${res.status}): ${text}`, 502);
  }

  const json = (await res.json()) as {
    files?: DriveFile[];
    nextPageToken?: string;
  };

  const items: DriveBrowseItem[] = (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    thumbnailUrl: f.mimeType === FOLDER_MIME ? null : `/api/drive/thumbnail/${f.id}`,
    previewUrl: f.mimeType === FOLDER_MIME ? null : `/api/drive/file/${f.id}`,
  }));

  return apiOk<DriveBrowseResponse>({
    items,
    nextPageToken: json.nextPageToken ?? null,
  });
}
