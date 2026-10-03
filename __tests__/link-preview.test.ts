import { describe, expect, it } from "vitest";
import { isInstagramPermalink, parseLinkPreview } from "../lib/instagram/link-preview";

describe("shared post link previews", () => {
  it("only accepts https instagram.com permalinks", () => {
    expect(isInstagramPermalink("https://www.instagram.com/reel/abc/")).toBe(true);
    expect(isInstagramPermalink("https://instagram.com/p/abc/")).toBe(true);
    expect(isInstagramPermalink("http://www.instagram.com/reel/abc/")).toBe(false);
    expect(isInstagramPermalink("https://evil.com/?u=instagram.com")).toBe(false);
    expect(isInstagramPermalink("https://instagram.com.evil.com/x")).toBe(false);
    expect(isInstagramPermalink("not a url")).toBe(false);
  });

  it("reads cover image and author from Open Graph tags", () => {
    const html =
      '<meta property="og:title" content="Pedro Mallet on Instagram: &quot;oi&quot;" />' +
      '<meta property="og:image" content="https://scontent.cdninstagram.com/a.jpg?x=1&amp;y=2" />';
    expect(parseLinkPreview(html)).toEqual({
      author: "Pedro Mallet",
      image: "https://scontent.cdninstagram.com/a.jpg?x=1&y=2",
    });
  });

  it("ignores non-https images and missing tags", () => {
    expect(parseLinkPreview('<meta property="og:image" content="javascript:alert(1)" />')).toEqual({
      image: undefined,
      author: undefined,
    });
  });
});
