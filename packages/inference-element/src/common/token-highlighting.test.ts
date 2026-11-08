import { expect } from "buckwheat";
import { describe, it } from "mocha";
import {
  highlightJson,
  highlightTp,
  highlightYaml,
} from "./token-highlighting.js";

describe("token-highlighting", () => {
  it("highlights json", () => {
    const json = '{\n  "name": "TypePrompt",\n  "version": 1,\n  "ok": true\n}';
    const highlighted = highlightJson(json);
    expect(highlighted.includes('class="hl-key"')).toBe(true);
    expect(highlighted.includes('class="hl-string"')).toBe(true);
    expect(highlighted.includes('class="hl-number"')).toBe(true);
    expect(highlighted.includes('class="hl-boolean"')).toBe(true);
  });

  it("highlights yaml", () => {
    const yaml = "model: gpt-4o\ntemperature: 0.7\n";
    const highlighted = highlightYaml(yaml);
    expect(highlighted.includes('class="hl-key"')).toBe(true);
  });

  it("highlights template syntax", () => {
    const tp = '<template name="Greeting">\n  Hello world\n</template>';
    const highlighted = highlightTp(tp);
    expect(highlighted.length > 0).toBe(true);
  });
});
