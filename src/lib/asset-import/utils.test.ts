import { describe, it, expect } from "vitest";
import {
  dedupeByRef,
  facebookPageUrl,
  importedFilename,
  instagramProfileUrl,
  isWithinWindow,
  metaMediaRef,
  stripFacebookDisplaySize,
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
