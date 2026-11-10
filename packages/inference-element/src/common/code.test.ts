import { expect } from "buckwheat";
import { describe, it } from "mocha";
import assert from "node:assert";
import { CodeElement } from "./code.js";

function getRenderedContent(el: CodeElement): string {
  const template = el.render();
  const directive = (
    template as unknown as {
      values: readonly [{ values: readonly string[] }];
    }
  ).values[0];
  return directive?.values?.[0] ?? "";
}

describe("CodeElement (<tp-code>)", () => {
  it("initializes component instance", () => {
    const el = new CodeElement();
    assert.ok(el);
    assert.strictEqual(el.tagName.toLowerCase(), "tp-code");
    assert.strictEqual(el.language, "text");
    assert.strictEqual(el.code, "");
  });

  it("highlights json", () => {
    const el = new CodeElement();
    el.language = "json";
    el.code = '{\n  "name": "TypePrompt",\n  "version": 1,\n  "ok": true\n}';
    const rendered = getRenderedContent(el);
    expect(rendered.includes('class="hl-key"')).toBe(true);
    expect(rendered.includes('class="hl-string"')).toBe(true);
    expect(rendered.includes('class="hl-number"')).toBe(true);
    expect(rendered.includes('class="hl-boolean"')).toBe(true);
  });

  it("highlights yaml", () => {
    const el = new CodeElement();
    el.language = "yaml";
    el.code = "model: gpt-4o\ntemperature: 0.7\n";
    const rendered = getRenderedContent(el);
    expect(rendered.includes('class="hl-key"')).toBe(true);
  });

  it("highlights template syntax", () => {
    const el = new CodeElement();
    el.language = "tp";
    el.code = '<template name="Greeting">\n  Hello world\n</template>';
    const rendered = getRenderedContent(el);
    expect(rendered.length > 0).toBe(true);
    expect(rendered.includes('class="hl-xml-tag"')).toBe(true);
  });

  it("renders plain text with HTML escaped", () => {
    const el = new CodeElement();
    el.language = "text";
    el.code = "<div>&'\"</div>";
    const rendered = getRenderedContent(el);
    expect(rendered).toBe("&lt;div&gt;&amp;&#039;&quot;&lt;/div&gt;");
  });

  it("handles empty code gracefully", () => {
    const el = new CodeElement();
    el.code = "";
    const rendered = getRenderedContent(el);
    expect(rendered).toBe("");
  });
});
