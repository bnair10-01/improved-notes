import { describe, expect, it } from "vitest";
import { appendMyNote, linkSeconds, sourceLink, sourceVideos, timeLabel, timestampUrl, videoId } from "./video";

describe("videoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=9", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("%s", (url, id) => expect(videoId(url)).toBe(id));

  it("rejects other sites and malformed ids", () => {
    expect(videoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(videoId("not a url")).toBeNull();
  });
});

describe("linkSeconds", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ?t=225", 225],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=225s", 225],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3m45s", 225],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s", 3723],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", 0],
  ])("%s", (url, s) => expect(linkSeconds(url)).toBe(s));
});

describe("time helpers", () => {
  it("formats minutes and hours", () => {
    expect(timeLabel(225)).toBe("3:45");
    expect(timeLabel(5)).toBe("0:05");
    expect(timeLabel(3723)).toBe("1:02:03");
  });
  it("round-trips through a link", () => {
    expect(linkSeconds(timestampUrl("dQw4w9WgXcQ", 225))).toBe(225);
    expect(timestampUrl("dQw4w9WgXcQ", 0)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});

describe("sourceVideos", () => {
  it("finds videos on Source lines, in the forms imports write them", () => {
    const md = "Body\n\nSource: [Black Holes Explained](https://www.youtube.com/watch?v=aaaaaaaaaaa)\n\n*Source: [Crash Course](https://youtu.be/bbbbbbbbbbb)*";
    expect(sourceVideos(md)).toEqual([
      { id: "aaaaaaaaaaa", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "Black Holes Explained" },
      { id: "bbbbbbbbbbb", url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", title: "Crash Course" },
    ]);
  });

  it("reads several sources on one line, skipping websites and repeats", () => {
    const md = "Source: [Wikipedia: Black hole](https://en.wikipedia.org/wiki/Black_hole) · [Vid](https://youtu.be/ccccccccccc) · [Vid again](https://youtu.be/ccccccccccc)";
    expect(sourceVideos(md).map((v) => v.id)).toEqual(["ccccccccccc"]);
  });

  it("ignores a link pasted into the writing", () => {
    expect(sourceVideos("Watch this https://youtu.be/ddddddddddd later")).toEqual([]);
    expect(sourceVideos("Source: [Wikipedia](https://en.wikipedia.org/wiki/Cell)")).toEqual([]);
  });
});

describe("appendMyNote", () => {
  it("adds a heading once, then bullets with timestamp links", () => {
    const one = appendMyNote("Body\n", "aaaaaaaaaaa", 225);
    expect(one).toBe("Body\n\n## My notes\n- [3:45](https://www.youtube.com/watch?v=aaaaaaaaaaa&t=225s) ");
    const two = appendMyNote(one.trimEnd(), "aaaaaaaaaaa", 61);
    expect(two.match(/## My notes/g)).toHaveLength(1);
    expect(two.endsWith("- [1:01](https://www.youtube.com/watch?v=aaaaaaaaaaa&t=61s) ")).toBe(true);
  });
});

describe("sourceLink", () => {
  it("keeps a video's own title and makes it findable again", () => {
    const link = sourceLink("youtube", "Black Holes [Explained]", "https://youtu.be/aaaaaaaaaaa");
    expect(link).toBe("[Black Holes Explained](https://youtu.be/aaaaaaaaaaa)");
    expect(sourceVideos(`Source: ${link}`)[0]).toMatchObject({ id: "aaaaaaaaaaa", title: "Black Holes Explained" });
  });
  it("names a web page by its site", () => {
    expect(sourceLink("website", "Some title", "https://en.wikipedia.org/wiki/Cell")).toBe("[en.wikipedia.org](https://en.wikipedia.org/wiki/Cell)");
  });
});
