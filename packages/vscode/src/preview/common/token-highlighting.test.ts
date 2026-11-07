import { expect } from "buckwheat";
import { describe, it } from "mocha";
import {
  highlightJson,
  highlightTp,
  highlightYaml,
} from "./token-highlighting.js";

describe("token-highlighting", () => {
  describe("highlightJson", () => {
    it("highlights keys, strings, numbers, booleans, and null", () => {
      const json = '{\n  "count": 42,\n  "active": true,\n  "empty": null\n}';
      const result = highlightJson(json);
      expect(
        result.value.includes('<span class="hl-key">&quot;count&quot;</span>'),
      ).toBe(true);
      expect(result.value.includes('<span class="hl-number">42</span>')).toBe(
        true,
      );
      expect(
        result.value.includes('<span class="hl-boolean">true</span>'),
      ).toBe(true);
      expect(
        result.value.includes('<span class="hl-boolean">null</span>'),
      ).toBe(true);
    });

    it("gracefully falls back to escaped text for invalid json", () => {
      const invalid = "{ not valid json <tag> }";
      const result = highlightJson(invalid);
      expect(result.value).toBe("{ not valid json &lt;tag&gt; }");
    });
  });

  describe("highlightYaml", () => {
    it("highlights yaml keys, strings, and numbers", () => {
      const yaml = "name: Alice\nage: 30";
      const result = highlightYaml(yaml);
      expect(result.value.includes('<span class="hl-key">name</span>')).toBe(
        true,
      );
      expect(result.value.includes('<span class="hl-key">age</span>')).toBe(
        true,
      );
      expect(result.value.includes('<span class="hl-number">30</span>')).toBe(
        true,
      );
    });
  });

  describe("highlightTp", () => {
    it("highlights template syntax", () => {
      const tp = '<template name="Greeting">\nHello World\n</template>';
      const result = highlightTp(tp);
      expect(result.value.includes("hl-xml-tag")).toBe(true);
      expect(result.value.includes("hl-string")).toBe(true);
    });
  });
});
