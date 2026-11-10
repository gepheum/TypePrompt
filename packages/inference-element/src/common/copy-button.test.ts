import { describe, it } from "mocha";
import assert from "node:assert";
import { CopyButtonElement } from "./copy-button.js";

describe("CopyButtonElement", () => {
  it("initializes component instance", () => {
    const el = new CopyButtonElement();
    assert.ok(el);
    assert.strictEqual(el.tagName.toLowerCase(), "tp-copy-button");
  });

  it("renders with default Copy label", () => {
    const el = new CopyButtonElement();
    el.text = "hello world";
    const template = el.render();
    assert.ok(template);
    const strings = (template as unknown as { strings: readonly string[] })
      .strings;
    assert.ok(strings.join("").includes("btn-copy"));
    assert.ok(strings.join("").includes("Copy"));
  });

  it("copies text using navigator.clipboard when clicked", async () => {
    const el = new CopyButtonElement();
    el.text = "sample payload";

    let writtenText = "";
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: {
        writeText: async (t: string): Promise<void> => {
          writtenText = t;
        },
      },
      configurable: true,
      writable: true,
    });

    let defaultPrevented = false;
    let propagationStopped = false;
    const mockEvent = {
      preventDefault: (): void => {
        defaultPrevented = true;
      },
      stopPropagation: (): void => {
        propagationStopped = true;
      },
    } as unknown as MouseEvent;

    // Call copy handler directly
    await (el as unknown as { copy: (e: MouseEvent) => Promise<void> }).copy(
      mockEvent,
    );

    assert.strictEqual(writtenText, "sample payload");
    assert.strictEqual(defaultPrevented, true);
    assert.strictEqual(propagationStopped, true);
  });
});
