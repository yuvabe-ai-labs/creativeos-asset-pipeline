import { describe, it, expect } from "vitest";
import {
  decodeAssetCursor,
  encodeAssetCursor,
  dedupeByRef,
  facebookPageUrl,
  importTargetEditValue,
  importTargetLabel,
  importedFilename,
  isRefreshBase,
  instagramProfileUrl,
  isWithinWindow,
  metaMediaRef,
  refreshSince,
  renditionWidth,
  stripFacebookDisplaySize,
  websiteMediaRef,
  urlRef,
  websiteUrl,
} from "./utils";
import type { ScrapedAsset } from "./types";

describe("instagramProfileUrl / facebookPageUrl", () => {
  it.each(["chuppslife", "@chuppslife", "instagram.com/chuppslife", "https://www.instagram.com/chuppslife/?hl=en"])(
    "reads %s as the chuppslife profile",
    (input) => expect(instagramProfileUrl(input)).toBe("https://www.instagram.com/chuppslife/"),
  );

  it("rejects blanks, other hosts and junk", () => {
    expect(instagramProfileUrl("")).toBeNull();
    expect(instagramProfileUrl(null)).toBeNull();
    expect(instagramProfileUrl("https://facebook.com/chupps")).toBeNull();
    expect(instagramProfileUrl("two words")).toBeNull();
  });

  it("reads Facebook pages, including the Brand Kit placeholder's /page form", () => {
    expect(facebookPageUrl("/thechuppslife")).toBe("https://www.facebook.com/thechuppslife/");
    expect(facebookPageUrl("https://www.facebook.com/thechuppslife/")).toBe("https://www.facebook.com/thechuppslife/");
  });
});

describe("importTargetLabel / importTargetEditValue", () => {
  it("reads a target the way people write it", () => {
    expect(importTargetLabel("https://www.instagram.com/cocacola/")).toBe("instagram.com/cocacola");
    expect(importTargetLabel("https://chupps.com/")).toBe("chupps.com");
  });

  it("edits a social handle alone and a website as its label", () => {
    expect(importTargetEditValue("instagram", "https://www.instagram.com/cocacola/")).toBe("cocacola");
    expect(importTargetEditValue("website", "https://www.coca-cola.com/")).toBe("coca-cola.com");
    expect(importTargetEditValue("facebook", null)).toBe("");
  });
});

describe("websiteUrl", () => {
  it("adds https to a bare domain and rejects non-domains", () => {
    expect(websiteUrl("chupps.com")).toBe("https://chupps.com/");
    expect(websiteUrl("https://chupps.com/")).toBe("https://chupps.com/");
    expect(websiteUrl("not a site")).toBeNull();
    expect(websiteUrl("")).toBeNull();
  });
});

describe("refs", () => {
  it("uses the Meta CDN filename so an IG/FB cross-post shares one ref (D305)", () => {
    const ig = "https://instagram.fvlc7-1.fna.fbcdn.net/v/t51.82787-15/825326377_18626865931034330_4472252468229698257_n.jpg?stp=x";
    const fb = "https://scontent-hou1-1.xx.fbcdn.net/v/t51.82787-15/825326377_18626865931034330_4472252468229698257_n.jpg?ctp=s590x590";
    expect(metaMediaRef(ig)).toBe(metaMediaRef(fb));
  });

  it("falls back to the query-less URL", () => {
    expect(metaMediaRef("https://cdn.x.com/a/b.jpg?w=1")).toBe("url:cdn.x.com/a/b.jpg");
    expect(urlRef("https://chupps.com/cdn/logo.svg?v=1&width=360")).toBe(urlRef("https://chupps.com/cdn/logo.svg?width=120"));
  });
});

describe("websiteMediaRef / renditionWidth", () => {
  it.each([
    ["https://x.com/dam/banner.png/width3840.png", "https://x.com/dam/banner.png/width1338.png"],
    ["https://x.com/img/hero.coreimg.85.1024.jpeg", "https://x.com/img/hero.coreimg.85.480.jpeg"],
    ["https://x.com/wp/hero-1024x768.jpg", "https://x.com/wp/hero-300x200.jpg?ver=2"],
    ["https://cdn.shop.com/files/hero_1080x.jpg", "https://cdn.shop.com/files/hero_640x480.jpg"],
    ["https://x.com/logo@2x.png", "https://x.com/logo.png"],
  ])("treats %s and %s as one asset", (a, b) => {
    expect(websiteMediaRef(a)).toBe(websiteMediaRef(b));
  });

  it("keeps genuinely different files apart (mobile vs desktop crops)", () => {
    expect(websiteMediaRef("https://x.com/dam/banner-mo.png/width3840.png")).not.toBe(
      websiteMediaRef("https://x.com/dam/banner-desktop.png/width3840.png"),
    );
  });

  it("reads the width a rendition URL names", () => {
    expect(renditionWidth("https://x.com/a.png/width2674.png")).toBe(2674);
    expect(renditionWidth("https://x.com/a-300x200.jpg")).toBe(300);
    expect(renditionWidth("https://cdn.shop.com/a.jpg?v=1&width=1600")).toBe(1600);
    expect(renditionWidth("https://x.com/a.jpg")).toBeNull();
  });
});

describe("stripFacebookDisplaySize", () => {
  it("removes only ctp", () => {
    const out = stripFacebookDisplaySize("https://s.fbcdn.net/x_n.jpg?stp=a&ctp=s590x590&oh=sig&oe=1");
    expect(out).toBe("https://s.fbcdn.net/x_n.jpg?stp=a&oh=sig&oe=1");
  });
});

describe("isWithinWindow", () => {
  const now = new Date("2026-10-05T00:00:00Z");
  it("keeps the last 3 months and undated posts", () => {
    expect(isWithinWindow("2026-07-06T00:00:00Z", now)).toBe(true);
    expect(isWithinWindow("2026-07-04T00:00:00Z", now)).toBe(false);
    expect(isWithinWindow(undefined, now)).toBe(true);
  });
});

describe("asset cursors", () => {
  const cursor = { sortAt: "2026-10-02T12:34:54+00:00", id: "6f1d2c1e-8a3b-4c5d-9e0f-1a2b3c4d5e6f" };

  it("round-trips", () => {
    expect(decodeAssetCursor(encodeAssetCursor(cursor))).toEqual(cursor);
  });

  it("rejects missing, garbage and tampered cursors", () => {
    expect(decodeAssetCursor(null)).toBeNull();
    expect(decodeAssetCursor("not-base64-json")).toBeNull();
    const injected = Buffer.from(JSON.stringify(["2026-10-02", "x),id.gt.(0"])).toString("base64url");
    expect(decodeAssetCursor(injected)).toBeNull();
    const badDate = Buffer.from(JSON.stringify(["yesterday", cursor.id])).toString("base64url");
    expect(decodeAssetCursor(badDate)).toBeNull();
  });
});

describe("isRefreshBase", () => {
  it("counts a real success, including one with nothing new", () => {
    expect(isRefreshBase("succeeded", { assetCount: 5, failed: 0 })).toBe(true);
    expect(isRefreshBase("succeeded", { assetCount: 0, failed: 0 })).toBe(true);
    expect(isRefreshBase("succeeded", { assetCount: 3, failed: 2 })).toBe(true);
  });

  it("does not count a failure, or a success that saved nothing because every save failed", () => {
    expect(isRefreshBase("failed", null)).toBe(false);
    expect(isRefreshBase("succeeded", { assetCount: 0, failed: 38 })).toBe(false);
  });
});

describe("refreshSince", () => {
  const now = new Date("2026-10-05T12:00:00Z");

  it("fetches from a day before the last successful import", () => {
    expect(refreshSince("2026-10-03T09:00:00Z", now)).toBe("2026-10-02");
  });

  it("never reaches back past the 3-month window", () => {
    expect(refreshSince("2026-01-01T00:00:00Z", now)).toBe("2026-07-05");
  });

  it("fetches the whole window when there is nothing to build on", () => {
    expect(refreshSince(null, now)).toBeNull();
    expect(refreshSince("garbage", now)).toBeNull();
  });
});

describe("dedupeByRef / importedFilename", () => {
  const a = (ref: string, url = "https://x.com/a.jpg"): ScrapedAsset => ({ source: "website", mediaType: "image", url, ref });

  it("keeps the first of each ref", () => {
    expect(dedupeByRef([a("1"), a("2"), a("1")]).map((x) => x.ref)).toEqual(["1", "2"]);
  });

  it("names the file after its source and original name", () => {
    expect(importedFilename(a("r", "https://chupps.com/cdn/Chupps%20Logo.svg?v=1"), "svg")).toBe("website-Chupps-Logo.svg");
    expect(importedFilename(a("r", "https://x.com/"), "jpg")).toBe("website-image.jpg");
  });
});
