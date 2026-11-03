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

const FILE_FIELDS = "nextPageToken,files(id,name,mimeType,modifiedTime,thumbnailLink)";
/** A search covers the folder and everything under it, up to this many folders. */
const MAX_SEARCH_FOLDERS = 300;
/** Folders named in one Drive query's `in parents` clause, so the query stays short. */
const PARENTS_PER_QUERY = 40;

function listUrl(q: string, fields: string, pageSize: number, pageToken?: string, orderBy?: string): string {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", fields);
  url.searchParams.set("pageSize", String(pageSize));
  if (orderBy) url.searchParams.set("orderBy", orderBy);
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url.toString();
}

function inParents(ids: readonly string[]): string {
  return `(${ids.map((id) => `'${escapeDriveLiteral(id)}' in parents`).join(" or ")})`;
}

function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

class DriveError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Drive API error (${status})`);
  }
}

async function driveList<T>(token: string, url: string): Promise<{ files?: T[]; nextPageToken?: string }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new DriveError(res.status, await res.text());
  return res.json();
}

/** The folder and every folder under it, level by level (Drive has no recursive search): one
 *  round of queries per level, the queries within a level in parallel. Capped at
 *  MAX_SEARCH_FOLDERS so a vast tree cannot turn one keystroke into hundreds of calls. */
async function folderTree(token: string, rootId: string): Promise<string[]> {
  const all = [rootId];
  const seen = new Set(all);
  let level = [rootId];
  while (level.length > 0 && all.length < MAX_SEARCH_FOLDERS) {
    const batches = await Promise.all(
      chunk(level, PARENTS_PER_QUERY).map(async (parents) => {
        const ids: string[] = [];
        let pageToken: string | undefined;
        do {
          const json = await driveList<{ id: string }>(
            token,
            listUrl(`mimeType='${FOLDER_MIME}' and trashed=false and ${inParents(parents)}`, "nextPageToken,files(id)", 1000, pageToken),
          );
          ids.push(...(json.files ?? []).map((f) => f.id));
          pageToken = json.nextPageToken;
        } while (pageToken);
        return ids;
      }),
    );
    level = batches.flat().filter((id) => !seen.has(id));
    for (const id of level) seen.add(id);
    all.push(...level);
  }
  return all.slice(0, MAX_SEARCH_FOLDERS);
}

/** Files whose names match, anywhere under the folder. One folder group pages as browsing does;
 *  several are read in parallel, merged newest first (folders first), with no further page. */
async function searchTree(
  token: string,
  rootId: string,
  search: string,
  pageToken: string | undefined,
): Promise<{ files: DriveFile[]; nextPageToken: string | null }> {
  const folders = await folderTree(token, rootId);
  const nameQ = `name contains '${escapeDriveLiteral(search)}' and trashed=false`;
  const groups = chunk(folders, PARENTS_PER_QUERY);
  if (groups.length === 1) {
    const json = await driveList<DriveFile>(
      token,
      listUrl(`${inParents(groups[0])} and ${nameQ}`, FILE_FIELDS, 50, pageToken, "folder,modifiedTime desc"),
    );
    return { files: json.files ?? [], nextPageToken: json.nextPageToken ?? null };
  }
  const results = await Promise.all(
    groups.map((g) =>
      driveList<DriveFile>(token, listUrl(`${inParents(g)} and ${nameQ}`, FILE_FIELDS, 50, undefined, "folder,modifiedTime desc")),
    ),
  );
  const files = results
    .flatMap((r) => r.files ?? [])
    .sort((a, b) => {
      const af = a.mimeType === FOLDER_MIME ? 0 : 1;
      const bf = b.mimeType === FOLDER_MIME ? 0 : 1;
      return af - bf || b.modifiedTime.localeCompare(a.modifiedTime);
    });
  return { files, nextPageToken: null };
}

function toItems(files: DriveFile[]): DriveBrowseItem[] {
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    thumbnailUrl: f.mimeType === FOLDER_MIME ? null : `/api/drive/thumbnail/${f.id}`,
    previewUrl: f.mimeType === FOLDER_MIME ? null : `/api/drive/file/${f.id}`,
  }));
}

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

  // A search reaches every subfolder: a client whose references are filed in subfolders (only
  // folders at the root) otherwise found nothing from the root, which read as a broken search.
  if (search) {
    try {
      const found = await searchTree(accessToken, folderId, search, pageToken);
      return apiOk<DriveBrowseResponse>({ items: toItems(found.files), nextPageToken: found.nextPageToken });
    } catch (err) {
      if (err instanceof DriveError) {
        if (err.status === 404) return apiError("folder_not_found", 404);
        return apiError(`Drive API error (${err.status}): ${err.body}`, 502);
      }
      throw err;
    }
  }

  const q = `'${escapeDriveLiteral(folderId)}' in parents and trashed=false`;
  const res = await fetch(listUrl(q, FILE_FIELDS, 50, pageToken, "folder,modifiedTime desc"), {
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

  return apiOk<DriveBrowseResponse>({
    items: toItems(json.files ?? []),
    nextPageToken: json.nextPageToken ?? null,
  });
}
