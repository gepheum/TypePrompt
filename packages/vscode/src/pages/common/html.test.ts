import { expect } from "buckwheat";
import { describe, it } from "mocha";
import { escapeHtml, html, rawHtml, SafeHtml } from "./html.js";

describe("html utilities", () => {
  describe("escapeHtml", () => {
    it("escapes special HTML characters", () => {
      expect(escapeHtml("<div class=\"foo\" data-id='bar'>&baz</div>")).toBe(
        "&lt;div class=&quot;foo&quot; data-id=&#39;bar&#39;&gt;&amp;baz&lt;/div&gt;",
      );
    });

    it("handles null and undefined by returning empty string", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
    });

    it("converts numbers and booleans to strings", () => {
      expect(escapeHtml(123)).toBe("123");
      expect(escapeHtml(true)).toBe("true");
    });
  });

  describe("rawHtml & SafeHtml", () => {
    it("preserves HTML without escaping when wrapped in SafeHtml", () => {
      const raw = rawHtml("<span>Bold & Beautiful</span>");
      expect(raw instanceof SafeHtml).toBe(true);
      expect(raw.value).toBe("<span>Bold & Beautiful</span>");
      expect(raw.toString()).toBe("<span>Bold & Beautiful</span>");
    });
  });

  describe("html tagged template literal", () => {
    it("automatically escapes interpolated string values", () => {
      const userInput = "<script>alert('xss')</script>";
      const result = html`<div>${userInput}</div>`;
      expect(result.value).toBe(
        "<div>&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;</div>",
      );
    });

    it("preserves SafeHtml without double escaping", () => {
      const safe = rawHtml("<strong>Hello</strong>");
      const result = html`<div>${safe}</div>`;
      expect(result.value).toBe("<div><strong>Hello</strong></div>");
    });

    it("handles arrays of strings and SafeHtml items", () => {
      const items = ["<b>One</b>", rawHtml("<i>Two</i>")];
      const result = html`<p>${items}</p>`;
      expect(result.value).toBe("<p>&lt;b&gt;One&lt;/b&gt;<i>Two</i></p>");
    });
  });
});
