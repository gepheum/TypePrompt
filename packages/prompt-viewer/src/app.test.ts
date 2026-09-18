import assert from "node:assert";
import { App } from "./app.js";

describe("Prompt Viewer App", () => {
  it("initializes with default message", () => {
    const app = new App();
    assert.strictEqual(app.message, "Hello World");
  });
});
