import { describe, expect, it, vi, beforeEach } from "vitest";
import { __resetDriveImagesCache, __driveImagesInternals } from "./use-drive-images";
import type { DriveImageItem, DriveImagesResponse } from "@/app/api/drive/images/route";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

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

    await __driveImagesInternals.doFetch(undefined, "initial");

    const state = __driveImagesInternals.getState();
    expect(state.pages).toHaveLength(1);
    expect(state.pages[0]).toHaveLength(1);
    expect(state.nextPageToken).toBe("cursor-2");
    expect(state.loadError).toBeNull();
  });

  it("loadMore appends a page", async () => {
    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "a" })], "cursor-2"),
    );
    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "b" })], null),
    );

    await __driveImagesInternals.doFetch(undefined, "initial");
    await __driveImagesInternals.doFetch("cursor-2", "more");

    const state = __driveImagesInternals.getState();
    expect(state.pages).toHaveLength(2);
    expect(state.pages.flat().map((i) => i.id)).toEqual(["a", "b"]);
    expect(state.nextPageToken).toBeNull();
  });

  it("refresh replaces cache", async () => {
    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "old" })], null),
    );
    await __driveImagesInternals.doFetch(undefined, "initial");
    expect(__driveImagesInternals.getState().pages[0][0].id).toBe("old");

    fetchMock.mockResolvedValueOnce(
      mockPageResponse([makeItem({ id: "new" })], null),
    );
    await __driveImagesInternals.doFetch(undefined, "refresh");
    const state = __driveImagesInternals.getState();
    expect(state.pages).toHaveLength(1);
    expect(state.pages[0][0].id).toBe("new");
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
    await __driveImagesInternals.doFetch(undefined, "initial");
    const folders = __driveImagesInternals.computeAvailableFolders(
      __driveImagesInternals.getState().pages,
    );
    expect(folders.map((f) => f.name)).toEqual(["Alpha", "Beta"]);
  });

  it("sets loadError on fetch failure and keeps cache untouched", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "boom",
    });

    await __driveImagesInternals.doFetch(undefined, "initial");

    const state = __driveImagesInternals.getState();
    expect(state.loadError).toBeTruthy();
    expect(state.pages).toHaveLength(0);
  });
});
