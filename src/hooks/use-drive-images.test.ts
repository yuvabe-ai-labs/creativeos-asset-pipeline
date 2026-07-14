import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  __resetDriveImagesCache,
  __driveImagesInternals,
  type DriveImagesFilters,
} from "./use-drive-images";
import type { DriveImageItem, DriveImagesResponse } from "@/app/api/drive/images/route";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const noFilters: DriveImagesFilters = {
  sharedOnly: false,
  folderIds: [],
  search: "",
};

function makeItem(overrides: Partial<DriveImageItem>): DriveImageItem {
  return {
    id: "id",
    name: "name.jpg",
    mimeType: "image/jpeg",
    thumbnailUrl: "",
    previewUrl: "",
    modifiedTime: "",
    ownedByMe: true,
    isShared: false,
    parentFolder: null,
    ...overrides,
  };
}

function mockPageResponse(items: DriveImageItem[], nextPageToken: string | null): {
  ok: boolean;
  json: () => Promise<DriveImagesResponse>;
} {
  return { ok: true, json: async () => ({ items, nextPageToken }) };
}

describe("useDriveImages internals", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    __resetDriveImagesCache();
  });

  it("fetches page 1 and populates cache", async () => {
    const items = [makeItem({ id: "a", parentFolder: { id: "fA", name: "Folder A" } })];
    fetchMock.mockResolvedValueOnce(mockPageResponse(items, "cursor-2"));

    await __driveImagesInternals.doFetch(noFilters, undefined, "initial");

    const entry = __driveImagesInternals.getEntry(noFilters);
    expect(entry?.pages).toHaveLength(1);
    expect(entry?.pages[0]).toHaveLength(1);
    expect(entry?.nextPageToken).toBe("cursor-2");
    expect(entry?.loadError).toBeNull();
  });

  it("loadMore appends a page", async () => {
    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "a" })], "cursor-2"),
    );
    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "b" })], null),
    );

    await __driveImagesInternals.doFetch(noFilters, undefined, "initial");
    await __driveImagesInternals.doFetch(noFilters, "cursor-2", "more");

    const entry = __driveImagesInternals.getEntry(noFilters);
    expect(entry?.pages).toHaveLength(2);
    expect(entry?.pages.flat().map((i) => i.id)).toEqual(["a", "b"]);
    expect(entry?.nextPageToken).toBeNull();
  });

  it("refresh replaces cache", async () => {
    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "old" })], null),
    );
    await __driveImagesInternals.doFetch(noFilters, undefined, "initial");
    expect(__driveImagesInternals.getEntry(noFilters)?.pages[0][0].id).toBe("old");

    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "new" })], null),
    );
    await __driveImagesInternals.doFetch(noFilters, undefined, "refresh");
    const entry = __driveImagesInternals.getEntry(noFilters);
    expect(entry?.pages).toHaveLength(1);
    expect(entry?.pages[0][0].id).toBe("new");
  });

  it("keeps separate caches per filter set", async () => {
    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "unfiltered" })], null),
    );
    await __driveImagesInternals.doFetch(noFilters, undefined, "initial");

    const sharedFilters: DriveImagesFilters = { ...noFilters, sharedOnly: true };
    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "shared-only" })], null),
    );
    await __driveImagesInternals.doFetch(sharedFilters, undefined, "initial");

    expect(__driveImagesInternals.getEntry(noFilters)?.pages[0][0].id).toBe("unfiltered");
    expect(__driveImagesInternals.getEntry(sharedFilters)?.pages[0][0].id).toBe("shared-only");
  });

  it("sends filter params in the URL query string", async () => {
    fetchMock.mockResolvedValueOnce(mockPageResponse([], null));
    await __driveImagesInternals.doFetch(
      { sharedOnly: true, folderIds: ["fA", "fB"], search: "logo" },
      undefined,
      "initial",
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("sharedOnly=1");
    expect(url).toContain("folderIds=fA%2CfB");
    expect(url).toContain("q=logo");
  });

  it("computes availableFolders as unique sorted list from loaded pages", async () => {
    fetchMock.mockResolvedValueOnce(
      mockPageResponse(
        [
          makeItem({ id: "1", parentFolder: { id: "fB", name: "Beta" } }),
          makeItem({ id: "2", parentFolder: { id: "fA", name: "Alpha" } }),
          makeItem({ id: "3", parentFolder: { id: "fB", name: "Beta" } }),
        ],
        null,
      ),
    );
    await __driveImagesInternals.doFetch(noFilters, undefined, "initial");
    const folders = __driveImagesInternals.computeAvailableFolders(
      __driveImagesInternals.getEntry(noFilters)?.pages ?? [],
    );
    expect(folders.map((f) => f.name)).toEqual(["Alpha", "Beta"]);
  });

  it("sets loadError on fetch failure and keeps existing pages", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "boom",
    });

    await __driveImagesInternals.doFetch(noFilters, undefined, "initial");

    const entry = __driveImagesInternals.getEntry(noFilters);
    expect(entry?.loadError).toBeTruthy();
    expect(entry?.pages ?? []).toHaveLength(0);
  });
});
