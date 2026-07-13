import { NextRequest } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export type DriveFileItem = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl: string | null;
  modifiedTime: string;
};

export type DriveFilesResponse = {
  files: DriveFileItem[];
  nextPageToken: string | null;
};

const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
].join(",");

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

  const mimeFilters = IMAGE_MIME_TYPES.split(",")
    .map((m) => `mimeType='${m}'`)
    .join(" or ");
  const q = `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and (${mimeFilters}) and trashed=false`;

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,thumbnailLink,modifiedTime)");
  url.searchParams.set("pageSize", "48");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return apiError(`Drive API error: ${text}`, 502);
  }

  const json = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType: string;
      thumbnailLink?: string;
      modifiedTime: string;
    }>;
    nextPageToken?: string;
  };

  const files: DriveFileItem[] = (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    thumbnailUrl: f.thumbnailLink ?? null,
    modifiedTime: f.modifiedTime,
  }));

  return apiOk<DriveFilesResponse>({
    files,
    nextPageToken: json.nextPageToken ?? null,
  });
}
