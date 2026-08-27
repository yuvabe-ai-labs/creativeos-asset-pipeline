import { describe, it, expect } from "vitest";
import { classifyUrl, youtubeVideoId, embedUrlFor, isYouTubeShort } from "./classify";

describe("classifyUrl", () => {
  it("classifies YouTube watch, shorts and youtu.be URLs", () => {
    expect(classifyUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(classifyUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(classifyUrl("https://www.youtube.com/shorts/abc123DEF45")).toBe("youtube");
  });

  it("classifies Instagram post/reel/tv URLs", () => {
    expect(classifyUrl("https://www.instagram.com/reel/C8xyz123/")).toBe("instagram");
    expect(classifyUrl("https://www.instagram.com/p/C8xyz123/")).toBe("instagram");
    expect(classifyUrl("https://instagram.com/tv/C8xyz123/")).toBe("instagram");
  });

  it("classifies TikTok URLs, including short links", () => {
    expect(classifyUrl("https://www.tiktok.com/@user/video/7301234567890123456")).toBe("tiktok");
    expect(classifyUrl("https://vm.tiktok.com/ZMabcdef/")).toBe("tiktok");
  });

  it("classifies direct media by extension, ignoring query strings", () => {
    expect(classifyUrl("https://cdn.example.com/a.jpg?w=800")).toBe("image");
    expect(classifyUrl("https://cdn.example.com/a.PNG")).toBe("image");
    expect(classifyUrl("https://cdn.example.com/a.webp")).toBe("image");
    expect(classifyUrl("https://media.example.com/a.gif")).toBe("gif");
    expect(classifyUrl("https://media.example.com/a.mp4")).toBe("video");
    expect(classifyUrl("https://media.example.com/a.webm")).toBe("video");
  });

  it("falls back to link for everything else, including garbage", () => {
    expect(classifyUrl("https://someblog.com/article")).toBe("link");
    expect(classifyUrl("not a url at all")).toBe("link");
  });

  // An Instagram *profile* URL is not a post — link, not instagram.
  it("does not classify instagram profile pages as instagram posts", () => {
    expect(classifyUrl("https://www.instagram.com/nike/")).toBe("link");
  });
});

describe("youtubeVideoId", () => {
  it("extracts the id from watch, shorts and youtu.be forms", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/shorts/abc123DEF45")).toBe("abc123DEF45");
  });
  it("returns null for non-YouTube URLs", () => {
    expect(youtubeVideoId("https://vimeo.com/123")).toBeNull();
  });
});

describe("isYouTubeShort", () => {
  it("identifies Shorts, which are vertical and need a 9:16 frame", () => {
    expect(isYouTubeShort("https://youtube.com/shorts/0gSk7f8O7Ik?si=abc")).toBe(true);
    expect(isYouTubeShort("https://www.youtube.com/shorts/abc123DEF45")).toBe(true);
  });
  it("is false for standard videos and non-YouTube URLs", () => {
    expect(isYouTubeShort("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(isYouTubeShort("https://youtu.be/dQw4w9WgXcQ")).toBe(false);
    expect(isYouTubeShort("https://www.instagram.com/reel/C8xyz/")).toBe(false);
    expect(isYouTubeShort("not a url")).toBe(false);
  });
});

describe("embedUrlFor", () => {
  it("builds a youtube-nocookie iframe URL", () => {
    expect(embedUrlFor("youtube", "https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });
  it("builds an Instagram /embed URL from the post path", () => {
    expect(embedUrlFor("instagram", "https://www.instagram.com/reel/C8xyz123/")).toBe(
      "https://www.instagram.com/reel/C8xyz123/embed",
    );
  });
  it("builds a TikTok v2 embed URL from a full video URL", () => {
    expect(
      embedUrlFor("tiktok", "https://www.tiktok.com/@user/video/7301234567890123456"),
    ).toBe("https://www.tiktok.com/embed/v2/7301234567890123456");
  });
  it("returns null when playback is not derivable (short links, plain links)", () => {
    expect(embedUrlFor("tiktok", "https://vm.tiktok.com/ZMabcdef/")).toBeNull();
    expect(embedUrlFor("link", "https://someblog.com/article")).toBeNull();
    expect(embedUrlFor("image", "https://cdn.example.com/a.jpg")).toBeNull();
  });
});
