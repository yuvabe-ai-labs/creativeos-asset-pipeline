import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signRequest, xDate } from "./sign";

// BytePlus publishes the algorithm but no worked example, so these tests check the pieces the
// spec fixes (header set, scope shape, date format) and recompute the signature independently.
// The live call is still the only proof the whole thing is right.
const FIXED = {
  accessKeyId: "AKTESTKEYID",
  secretAccessKey: "secret-key-value",
  action: "CVSubmitTask",
  version: "2024-06-06",
  body: JSON.stringify({ req_key: "realman_avatar_picture_omni15_cv" }),
  date: "20260923T104027Z",
};

describe("xDate", () => {
  it("is UTC, no punctuation, trailing Z", () => {
    expect(xDate(new Date("2026-09-23T10:40:27.123Z"))).toBe("20260923T104027Z");
  });
});

describe("signRequest", () => {
  it("signs host, x-date, x-content-sha256 and content-type, in ASCII order", () => {
    const { headers } = signRequest(FIXED);
    expect(headers.Authorization).toContain(
      "SignedHeaders=content-type;host;x-content-sha256;x-date",
    );
  });

  it("uses the documented credential scope {date}/{region}/{service}/request", () => {
    const { headers } = signRequest(FIXED);
    expect(headers.Authorization).toContain(
      "Credential=AKTESTKEYID/20260923/ap-singapore-1/cv/request",
    );
  });

  it("puts Action and Version in the query, ASCII-ordered", () => {
    expect(signRequest(FIXED).url).toBe(
      "https://cv.byteplusapi.com/?Action=CVSubmitTask&Version=2024-06-06",
    );
  });

  it("sends the payload hash as X-Content-Sha256", () => {
    const { headers } = signRequest(FIXED);
    expect(headers["X-Content-Sha256"]).toBe(
      createHash("sha256").update(FIXED.body, "utf8").digest("hex"),
    );
  });

  it("matches a signature derived independently from the documented steps", () => {
    const payloadHash = createHash("sha256").update(FIXED.body, "utf8").digest("hex");
    const canonical = [
      "POST",
      "/",
      "Action=CVSubmitTask&Version=2024-06-06",
      `content-type:application/json\nhost:cv.byteplusapi.com\n` +
        `x-content-sha256:${payloadHash}\nx-date:${FIXED.date}\n`,
      "content-type;host;x-content-sha256;x-date",
      payloadHash,
    ].join("\n");
    const stringToSign = [
      "HMAC-SHA256",
      FIXED.date,
      "20260923/ap-singapore-1/cv/request",
      createHash("sha256").update(canonical, "utf8").digest("hex"),
    ].join("\n");
    const h = (k: Buffer | string, v: string) => createHmac("sha256", k).update(v, "utf8").digest();
    const kSigning = h(h(h(h(FIXED.secretAccessKey, "20260923"), "ap-singapore-1"), "cv"), "request");
    const expected = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

    expect(signRequest(FIXED).headers.Authorization).toContain(`Signature=${expected}`);
  });
});
