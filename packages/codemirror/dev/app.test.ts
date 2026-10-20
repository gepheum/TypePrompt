import { describe, it } from "mocha";
import assert from "node:assert";
import { App } from "./app.js";

describe("Prompt Viewer App", () => {
  it("initializes App component", () => {
    const app = new App();
    assert.ok(app);
    assert.strictEqual(app.tagName.toLowerCase(), "code-mirror-app");
  });
});
