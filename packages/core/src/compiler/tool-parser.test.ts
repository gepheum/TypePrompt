import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalErrors } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Tool } from "./compiler-types.js";
import { parseTool as parseToolCore } from "./tool-parser.js";

function parseTool(
  toolNode: ElementNode,
  sourcePath?: string,
): Tool | InternalErrors {
  if (sourcePath !== undefined) {
    return parseToolCore({ ...toolNode, path: sourcePath });
  }
  return parseToolCore(toolNode);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(xml: string, path = "prompts/myTool.tp"): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

// ---------------------------------------------------------------------------
// parseTool
// ---------------------------------------------------------------------------

describe("parseTool", () => {
  it("parses a valid tool in the default namespace", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <description>Searches the web for information</description>
        <schema>
          type Input = { query: string; };
          type Output = { results: string[]; };
        </schema>
      </tool>
    `);

    expect(parseTool(root, "prompts/webSearch.tp")).toMatch({
      kind: "tool",
      name: { text: "webSearch" },
      namespace: null,
      description: [{ kind: "text", text: "Searches the web for information" }],
      schema: {
        kind: "success",
        typeDeclarations: {
          Input: {
            kind: "type",
            name: { text: "Input" },
          },
          Output: {
            kind: "type",
            name: { text: "Output" },
          },
        },
      },
      warnings: [],
    });
  });

  it("parses a valid tool in a custom namespace with matching subdirectory path", () => {
    const root = parseElement(`
      <tool name="fetchUser" namespace="Users">
        <description>Fetches <c>UserRecord</c> by id</description>
        <schema>
          type Input = { userId: string; };
          type Output = { user: string; };
        </schema>
      </tool>
    `);

    expect(parseTool(root, "prompts/Users/fetchUser.tp")).toMatch({
      kind: "tool",
      name: { text: "fetchUser" },
      namespace: { text: "Users" },
      description: [
        { kind: "text", text: "Fetches " },
        {
          kind: "c-tag",
          text: "UserRecord",
          cTag: {
            kind: "identifier",
            identifier: { text: "UserRecord" },
          },
        },
        { kind: "text", text: " by id" },
      ],
      schema: {
        kind: "success",
        typeDeclarations: {
          Input: {
            kind: "type",
            name: { text: "Input" },
          },
          Output: {
            kind: "type",
            name: { text: "Output" },
          },
        },
      },
      warnings: [],
    });
  });

  it("reports an error when the name attribute is missing", () => {
    const root = parseElement(`
      <tool>
        <description>Tool description</description>
        <schema>
          type Input = {};
          type Output = {};
        </schema>
      </tool>
    `);

    expect(parseTool(root, "myTool.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing required attribute 'name'",
        },
      ],
    });
  });

  it("rejects non-camelCase tool names", () => {
    const root = parseElement(`
      <tool name="WebSearch">
        <description>Desc</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "WebSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'name': expected a camelCase identifier",
        },
      ],
    });
  });

  it("rejects kebab-case tool names", () => {
    const root = parseElement(`
      <tool name="web-search">
        <description>Desc</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "web-search.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'name': expected a camelCase identifier",
        },
      ],
    });
  });

  it("rejects non-PascalCase namespace attributes", () => {
    const root = parseElement(`
      <tool name="fetchUser" namespace="users">
        <description>Desc</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "users/fetchUser.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'namespace': expected a PascalCase identifier",
        },
      ],
    });
  });

  it("reports an error for unexpected attributes on <tool>", () => {
    const root = parseElement(`
      <tool name="fetchUser" extra="bad">
        <description>Desc</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "fetchUser.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected attribute 'extra'",
        },
      ],
    });
  });

  it("rejects reserved tool name 'shared'", () => {
    const root = parseElement(`
      <tool name="shared">
        <description>Desc</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "shared.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Tool name cannot be 'shared",
        },
      ],
    });
  });

  it("rejects reserved tool name 'meta'", () => {
    const root = parseElement(`
      <tool name="meta">
        <description>Desc</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "meta.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Tool name cannot be 'meta",
        },
      ],
    });
  });

  it("emits a warning when file path does not match '**/<name>.tp' for default namespace", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <description>Desc</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "prompts/wrongName.tp")).toMatch({
      kind: "tool",
      name: { text: "webSearch" },
      warnings: [
        {
          message: "File path should match '**/webSearch.tp'",
        },
      ],
    });
  });

  it("emits a warning when file path does not match '**/<namespace>/<name>.tp' for custom namespace", () => {
    const root = parseElement(`
      <tool name="fetchUser" namespace="Users">
        <description>Desc</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "prompts/fetchUser.tp")).toMatch({
      kind: "tool",
      name: { text: "fetchUser" },
      namespace: { text: "Users" },
      warnings: [
        {
          message: "File path should match '**/Users/fetchUser.tp'",
        },
      ],
    });
  });

  it("reports an error when <description> element is missing", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <description> element",
        },
      ],
    });
  });

  it("reports an error when <schema> element is missing", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <description>Desc</description>
      </tool>
    `);

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <schema> element",
        },
      ],
    });
  });

  it("reports errors when both required child elements are missing", () => {
    const root = parseElement('<tool name="webSearch" />');

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing <description> element",
        },
        {
          message: "Missing <schema> element",
        },
      ],
    });
  });

  it("reports an error for duplicate <description> elements", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <description>First description</description>
        <description>Second description</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Multiple <description> elements in <tool>",
        },
      ],
    });
  });

  it("reports an error for duplicate <schema> elements", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <description>Desc</description>
        <schema>type Input = {};</schema>
        <schema>type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Multiple <schema> elements in <tool>",
        },
      ],
    });
  });

  it("reports an error for unexpected child elements in <tool>", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <unexpected />
        <description>Desc</description>
        <schema>type Input = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected element <unexpected> in <tool>",
        },
      ],
    });
  });

  it("reports an error when <description> has XML attributes", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <description lang="en">Desc</description>
        <schema>type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected attribute 'lang'",
        },
      ],
    });
  });

  it("reports an error when <schema> has XML attributes", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <description>Desc</description>
        <schema lang="ts">type Input = {}; type Output = {};</schema>
      </tool>
    `);

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected attribute 'lang'",
        },
      ],
    });
  });

  it("reports schema parse errors when <schema> contains invalid syntax", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <description>Desc</description>
        <schema>type Invalid = ;</schema>
      </tool>
    `);

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Expected one of: '(', '{', '|', 'shared', string literal, identifier",
        },
      ],
    });
  });

  it("emits warnings when <schema> contains XML comments", () => {
    const root = parseElement(`
      <tool name="webSearch">
        <description>Desc</description>
        <schema>
          <!-- Use TypeScript comments instead -->
          type Input = {};
          type Output = {};
        </schema>
      </tool>
    `);

    expect(parseTool(root, "webSearch.tp")).toMatch({
      kind: "tool",
      name: { text: "webSearch" },
      warnings: [
        {
          message: "Use TypeScript comments instead",
        },
      ],
    });
  });
});
