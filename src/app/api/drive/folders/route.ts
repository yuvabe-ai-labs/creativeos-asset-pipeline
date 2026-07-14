import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, apiOk } from "@/lib/api/route-helpers";

const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFolder = { id: string; name: string };

async function listFolders(q: string, accessToken: string): Promise<DriveFolder[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "200");
  url.searchParams.set("orderBy", "name");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive API error (${res.status})`);
  const json = (await res.json()) as { files?: DriveFolder[] };
  return json.files ?? [];
}

export type DriveFoldersResponse = {
  items: { id: string; name: string; isShared: boolean }[];
};

export async function GET() {
  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive.", 500);
  }

  try {
    const OWNED_Q = `mimeType='${FOLDER_MIME}' and trashed=false and 'me' in owners`;
    const SHARED_Q = `mimeType='${FOLDER_MIME}' and trashed=false and sharedWithMe=true`;

    const [owned, shared] = await Promise.all([
      listFolders(OWNED_Q, accessToken),
      listFolders(SHARED_Q, accessToken),
    ]);

    const seen = new Set<string>();
    const items: DriveFoldersResponse["items"] = [];
    for (const f of owned) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        items.push({ ...f, isShared: false });
      }
    }
    for (const f of shared) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        items.push({ ...f, isShared: true });
      }
    }
    items.sort((a, b) => a.name.localeCompare(b.name));

    return apiOk<DriveFoldersResponse>({ items });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Drive API error", 502);
  }
}
