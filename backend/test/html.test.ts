import { describe, expect, it } from "vitest";
import { htmlToText, sanitizeBody, toSafeHtml } from "../src/lib/html.js";

describe("sanitizeBody", () => {
  it("keeps basic formatting", () => {
    const html = "<p><strong>Hi</strong> <em>there</em></p><ul><li>one</li></ul>";
    expect(sanitizeBody(html)).toBe(html);
  });

  it("removes scripts, event handlers and javascript: links", () => {
    const cleaned = sanitizeBody(
      '<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><img src=x onerror=alert(1)>',
    );
    expect(cleaned).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(cleaned).toContain("a");
  });

  it("allows only text-align in styles", () => {
    const cleaned = sanitizeBody('<p style="text-align:center;position:fixed">x</p>');
    expect(cleaned).toContain("text-align:center");
    expect(cleaned).not.toContain("position");
  });

  it("forces safe rel/target on links", () => {
    expect(sanitizeBody('<a href="https://example.com">x</a>')).toContain('rel="noopener noreferrer"');
  });
});

describe("htmlToText", () => {
  it("turns block ends into line breaks", () => {
    expect(htmlToText("<p>one</p><p>two</p>")).toBe("one\ntwo");
  });

  it("is empty for an empty editor", () => {
    expect(htmlToText("<p></p>")).toBe("");
  });
});

describe("toSafeHtml", () => {
  it("escapes legacy plain-text bodies and keeps line breaks", () => {
    expect(toSafeHtml("a < b\nsecond")).toBe("<p>a &lt; b<br>second</p>");
  });
});
