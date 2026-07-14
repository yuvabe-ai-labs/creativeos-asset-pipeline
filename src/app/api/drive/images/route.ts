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

// Server-side filter modes:
//   - default (no filters): union of owned images + directly-shared-with-me
//     images. Two parallel files.list calls, deduped + sorted by modifiedTime.
//   - sharedOnly=1: recursively walks the "Shared with me" subtree so images
//     INSIDE shared folders are surfaced (not just top-level shares).
//   - folderIds=a,b,c: images whose parent is in that set. Runs one query per
//     folder (parallel), merges results.
//   - q=foo: substring filter applied server-side over the corpus above.

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHARED_TREE_MAX_DEPTH = 3;

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

async function queryDrive(
  q: string,
  accessToken: string,
  opts: { pageToken?: string; pageSize?: number } = {},
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set(
    "fields",
    "nextPageToken,files(id,name,mimeType,modifiedTime,ownedByMe,shared,parents)",
  );
  url.searchParams.set("pageSize", String(opts.pageSize ?? 50));
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  // corpora defaults to `user` = "files owned by or shared to the user". Do NOT
  // set corpora=allDrives — it silently drops sharedWithMe=true results per
  // Google's docs (the combination returns "incomplete results"). Shared Drives
  // still surface via includeItemsFromAllDrives=true above.
  if (opts.pageToken) url.searchParams.set("pageToken", opts.pageToken);

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

/** Depth-limited BFS over shared folders. Collects images at each level (with
 *  optional search filter applied server-side per query) and pushes folder
 *  children into the next level's queue. Single-shot: hands back all matched
 *  images, no pagination cursor. */
async function walkSharedTree(
  accessToken: string,
  search: string,
): Promise<DriveFile[]> {
  // Roots: shared-with-me items. We include folders unconditionally (so we can
  // recurse into them) but only include images that match the search.
  const searchQ = searchClause(search);
  const rootQ =
    `sharedWithMe=true and trashed=false and ` +
    `((mimeType contains 'image/' ${searchQ}) or mimeType='${FOLDER_MIME}')`;
  const roots = await queryDrive(rootQ, accessToken, { pageSize: 200 });

  const seen = new Set<string>();
  const collected: DriveFile[] = [];

  for (const f of roots.files) {
    if (f.mimeType.startsWith("image/") && !seen.has(f.id)) {
      seen.add(f.id);
      collected.push(f);
    }
  }

  let currentLevel = roots.files
    .filter((f) => f.mimeType === FOLDER_MIME)
    .map((f) => f.id);

  for (let depth = 0; depth < SHARED_TREE_MAX_DEPTH && currentLevel.length > 0; depth++) {
    const results = await Promise.all(
      currentLevel.map((folderId) =>
        queryDrive(
          `'${folderId}' in parents and trashed=false and ` +
            `((mimeType contains 'image/' ${searchQ}) or mimeType='${FOLDER_MIME}')`,
          accessToken,
          { pageSize: 200 },
        ),
      ),
    );
    const nextLevel: string[] = [];
    for (const result of results) {
      for (const f of result.files) {
        if (f.mimeType === FOLDER_MIME) {
          nextLevel.push(f.id);
        } else if (!seen.has(f.id)) {
          seen.add(f.id);
          collected.push(f);
        }
      }
    }
    currentLevel = nextLevel;
  }

  return collected;
}

async function walkFoldersByIds(
  folderIds: string[],
  accessToken: string,
  search: string,
): Promise<DriveFile[]> {
  const searchQ = searchClause(search);
  const results = await Promise.all(
    folderIds.map((folderId) =>
      queryDrive(
        `'${folderId}' in parents and mimeType contains 'image/' and trashed=false ${searchQ}`,
        accessToken,
        { pageSize: 200 },
      ),
    ),
  );
  const seen = new Set<string>();
  const merged: DriveFile[] = [];
  for (const r of results) {
    for (const f of r.files) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        merged.push(f);
      }
    }
  }
  return merged;
}

/** Escape single quotes for use inside a Drive `q` string literal. */
function escapeDriveLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function searchClause(search: string): string {
  if (!search) return "";
  return `and fullText contains '${escapeDriveLiteral(search)}'`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sharedOnly = searchParams.get("sharedOnly") === "1";
  const folderIdsRaw = searchParams.get("folderIds");
  const folderIds = folderIdsRaw
    ? folderIdsRaw.split(",").filter(Boolean)
    : [];
  const search = (searchParams.get("q") ?? "").trim();
  const cursorParam = searchParams.get("pageToken");

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive. Check server configuration.", 500);
  }

  let files: DriveFile[];
  let nextCursor: string | null = null;

  const searchQ = searchClause(search);

  try {
    if (sharedOnly) {
      // Traverse the shared subtree once; no paging (single-shot). Search
      // filter is applied per-query inside the walker.
      files = await walkSharedTree(accessToken, search);
      // Intersect with folderIds filter if BOTH are on.
      if (folderIds.length > 0) {
        const wanted = new Set(folderIds);
        files = files.filter((f) => f.parents?.some((p) => wanted.has(p)));
      }
    } else if (folderIds.length > 0) {
      // Explicit folder filter — walks the immediate children of the picked
      // folders. Also single-shot; realistic folder scopes are bounded.
      files = await walkFoldersByIds(folderIds, accessToken, search);
    } else {
      // Default corpus. Google's API has no "all files I can see" operator, so
      // we build the union manually:
      //   (1) owned images                       — paginated via ownedToken
      //   (2) images directly shared with me      — paginated via sharedToken
      //   (3) images inside folders shared with me — walker (single-shot on
      //       first page only; subsequent pages skip it since we already have
      //       all shared-tree results in the first response).
      let cursor: PageCursor = {};
      if (cursorParam) {
        try {
          cursor = JSON.parse(Buffer.from(cursorParam, "base64").toString("utf-8"));
        } catch {
          return apiError("Invalid pageToken", 400);
        }
      }
      const OWNED_Q = `mimeType contains 'image/' and trashed=false and 'me' in owners ${searchQ}`;
      const SHARED_Q = `mimeType contains 'image/' and trashed=false and sharedWithMe=true ${searchQ}`;
      const firstPage = !cursorParam;

      const [ownedRes, sharedRes, sharedTreeFiles] = await Promise.all([
        firstPage || cursor.ownedToken
          ? queryDrive(OWNED_Q, accessToken, { pageToken: cursor.ownedToken })
          : Promise.resolve({ files: [] as DriveFile[], nextPageToken: undefined }),
        firstPage || cursor.sharedToken
          ? queryDrive(SHARED_Q, accessToken, { pageToken: cursor.sharedToken })
          : Promise.resolve({ files: [] as DriveFile[], nextPageToken: undefined }),
        // Walk the shared-folder subtree on the first page only. The walker
        // returns all descendants up-front (no incremental fetch), so on
        // follow-up pages we've already exhausted this corpus.
        firstPage
          ? walkSharedTree(accessToken, search)
          : Promise.resolve([] as DriveFile[]),
      ]);

      const merged = new Map<string, DriveFile>();
      for (const f of [...ownedRes.files, ...sharedRes.files, ...sharedTreeFiles]) {
        if (!merged.has(f.id)) merged.set(f.id, f);
      }
      files = Array.from(merged.values());

      const nextCursorObj: PageCursor = {
        ownedToken: ownedRes.nextPageToken,
        sharedToken: sharedRes.nextPageToken,
      };
      const hasMore = !!(nextCursorObj.ownedToken || nextCursorObj.sharedToken);
      nextCursor = hasMore
        ? Buffer.from(JSON.stringify(nextCursorObj)).toString("base64")
        : null;
    }
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Drive API error", 502);
  }

  files.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));

  // Batch + dedupe parent folder lookups (used for the filter popover UI).
  const parentIds = new Set<string>();
  for (const f of files) {
    const first = f.parents?.[0];
    if (first) parentIds.add(first);
  }
  const folderEntries = await Promise.all(
    Array.from(parentIds).map(
      async (id) => [id, await fetchFolderMeta(id, accessToken)] as const,
    ),
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
      ownedByMe: f.ownedByMe ?? false,
      isShared: !(f.ownedByMe ?? true) || (f.shared ?? false) || sharedOnly,
      parentFolder,
    };
  });

  return apiOk<DriveImagesResponse>({ items, nextPageToken: nextCursor });
}
