import { describe, expect, it } from "vitest";
import {
  canStartBuild, fallbackSuggestions, isBuilding, liveStatus, openingMessage, sourcesSummary, type KbContext,
} from "../context";

const empty: KbContext = {
  clientName: "Acme", kbStatus: "pending", hasVersion: false, websiteUrl: null, instagram: null, facebook: null,
  documentCount: 0, imageCount: 0, job: null, importing: [], studyingImages: false,
};
const ctx = (over: Partial<KbContext>): KbContext => ({ ...empty, ...over });
const running = { status: "researching", phaseMessage: "Reading the website…" };

describe("isBuilding", () => {
  it("is true while the latest job has not finished", () => {
    expect(isBuilding(ctx({ job: running }))).toBe(true);
    expect(isBuilding(ctx({ job: { status: "queued", phaseMessage: null } }))).toBe(true);
  });
  it("is false with no job, or a finished one", () => {
    expect(isBuilding(empty)).toBe(false);
    expect(isBuilding(ctx({ job: { status: "succeeded", phaseMessage: null } }))).toBe(false);
    expect(isBuilding(ctx({ job: { status: "failed", phaseMessage: null } }))).toBe(false);
  });
});

describe("canStartBuild", () => {
  it("is true with only a document", () => {
    expect(canStartBuild(ctx({ documentCount: 1 }))).toBe(true);
  });
  it("is true with only a website", () => {
    expect(canStartBuild(ctx({ websiteUrl: "https://acme.com" }))).toBe(true);
  });
  it("is false with neither a website nor a document", () => {
    expect(canStartBuild(ctx({ imageCount: 3, instagram: "acme" }))).toBe(false);
  });
  it("is false while building", () => {
    expect(canStartBuild(ctx({ websiteUrl: "https://acme.com", job: running }))).toBe(false);
  });
  it("is false once a version exists", () => {
    expect(canStartBuild(ctx({ websiteUrl: "https://acme.com", hasVersion: true }))).toBe(false);
  });
});

describe("sourcesSummary", () => {
  it("joins the parts with commas and a final and", () => {
    expect(sourcesSummary(ctx({ websiteUrl: "https://www.acme.com/about", documentCount: 2, imageCount: 1 })))
      .toBe("the website acme.com, 2 documents and 1 image");
  });
  it("uses the singular and the plural", () => {
    expect(sourcesSummary(ctx({ documentCount: 1, imageCount: 3 }))).toBe("1 document and 3 images");
  });
  it("names one part alone", () => {
    expect(sourcesSummary(ctx({ websiteUrl: "acme.com" }))).toBe("the website acme.com");
  });
  it("says so when there is nothing", () => {
    expect(sourcesSummary(empty)).toBe("nothing yet");
  });
});

describe("openingMessage", () => {
  it("asks for the website on a new client", () => {
    expect(openingMessage(empty)).toBe("Let's build Acme's brand KB.\n\nWhat is the brand's website?\nNo website? Attach brand documents here instead.");
  });
  it("offers to start when there is something to build from", () => {
    expect(openingMessage(ctx({ websiteUrl: "https://acme.com", documentCount: 1 })))
      .toBe("I have the website acme.com and 1 document for Acme.\n\nShall I start the build?\nYou can add Instagram or Facebook handles, documents or images first.");
  });
  it("says a build is running", () => {
    expect(openingMessage(ctx({ websiteUrl: "https://acme.com", job: running })))
      .toBe("The brand KB for Acme is being built. I will say here when it is ready to review.");
  });
  it("points to the review when the KB is built", () => {
    expect(openingMessage(ctx({ kbStatus: "in_review", hasVersion: true })))
      .toBe("Acme's brand KB is built and waiting for your review on the right.\n\nReview each section there. You can mark the KB ready once every field is reviewed.");
  });
  it("says how to add to an approved KB", () => {
    expect(openingMessage(ctx({ kbStatus: "ready", hasVersion: true })))
      .toBe("Acme's brand KB is approved.\n\nTo add to it, attach a document or an image here, or tell me what changed.");
  });
});

describe("fallbackSuggestions", () => {
  it("offers to start the build when it can start", () => {
    expect(fallbackSuggestions(ctx({ documentCount: 1 }))).toEqual(["Start the build"]);
  });
  it("offers nothing otherwise", () => {
    expect(fallbackSuggestions(empty)).toEqual([]);
    expect(fallbackSuggestions(ctx({ websiteUrl: "https://acme.com", job: running }))).toEqual([]);
  });
});

describe("liveStatus", () => {
  it("is empty when nothing runs", () => {
    expect(liveStatus(empty)).toEqual([]);
  });
  it("shows the build's phase", () => {
    expect(liveStatus(ctx({ job: running }))).toEqual([{ text: "Reading the website…", state: "running" }]);
  });
  it("says the build is starting when the job has no phase yet", () => {
    expect(liveStatus(ctx({ job: { status: "queued", phaseMessage: null } }))).toEqual([{ text: "Starting the build…", state: "running" }]);
  });
  it("shows one line per running collection, then the image study", () => {
    expect(liveStatus(ctx({ importing: ["website", "instagram", "facebook"], studyingImages: true }))).toEqual([
      { text: "Collecting images and video from the website…", state: "running" },
      { text: "Collecting images and video from Instagram…", state: "running" },
      { text: "Collecting images and video from Facebook…", state: "running" },
      { text: "Studying the images…", state: "running" },
    ]);
  });
});
