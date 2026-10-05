import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalErrors } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Meta } from "./compiler-types.js";
import { parseMeta as parseMetaCore } from "./meta-parser.js";

function parseMeta(
  metaNode: ElementNode,
  sourcePath?: string,
): Meta | InternalErrors {
  if (sourcePath !== undefined) {
    return parseMetaCore({ ...metaNode, path: sourcePath });
  }
  return parseMetaCore(metaNode);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(xml: string, path = "prompts/Meta.xml"): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

// ---------------------------------------------------------------------------
// parseMeta
// ---------------------------------------------------------------------------

describe("parseMeta", () => {
  it("parses a valid <meta> schema definition", () => {
    const root = parseElement(`
      <meta>
        type Meta = {
          timeoutMs: number;
        };
      </meta>
    `);

    expect(parseMeta(root, "prompts/meta.xml")).toMatch({
      kind: "meta",
      schema: {
        kind: "success",
        typeDeclarations: {
          Meta: {
            kind: "type",
            name: { text: "Meta" },
            valueType: {
              kind: "interface",
              fields: {
                timeoutMs: {
                  name: { text: "timeoutMs" },
                  type: {
                    kind: "primitive",
                    primitive: { text: "number" },
                  },
                },
              },
            },
          },
        },
      },
      warnings: [],
    });
  });

  it("populates definition links when Meta references other types", () => {
    const root = parseElement(`
      <meta>
        type Meta = {
          env: Environment;
        };
        type Environment = "prod" | "dev";
      </meta>
    `);

    const result = parseMeta(root, "prompts/meta.xml");
    if (result.kind !== "meta") throw new Error();
    if (result.schema.kind !== "success") throw new Error();
    expect(result.schema.definitionLinks).toMatch([
      {
        reference: { path: "prompts/meta.xml" },
        definition: { path: "prompts/meta.xml" },
      },
    ]);
  });

  it("reports a validation error when Meta type is missing in empty <meta>", () => {
    const root = parseElement("<meta></meta>");

    expect(parseMeta(root, "meta.xml")).toMatch({
      kind: "meta",
      schema: {
        kind: "error",
        errors: [
          {
            message: "Missing required type 'Meta'",
          },
        ],
      },
      warnings: [],
    });
  });

  it("reports a validation error when Meta type is missing in self-closing <meta/>", () => {
    const root = parseElement("<meta/>");

    expect(parseMeta(root, "meta.xml")).toMatch({
      kind: "meta",
      schema: {
        kind: "error",
        errors: [
          {
            message: "Missing required type 'Meta'",
          },
        ],
      },
      warnings: [],
    });
  });

  it("reports an error when <meta> contains XML attributes", () => {
    const root = parseElement('<meta name="something"></meta>');

    expect(parseMeta(root, "meta.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected attribute 'name'",
        },
      ],
    });
  });

  it("reports an error when <meta> contains child XML elements", () => {
    const root = parseElement("<meta><childTag/></meta>");

    expect(parseMeta(root, "meta.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected element <childTag>",
        },
      ],
    });
  });

  it("emits a warning when <meta> contains XML comments", () => {
    const root = parseElement(`
      <meta>
        <!-- Use TypeScript comments instead -->
        type Meta = {
          debug: boolean;
        };
      </meta>
    `);

    expect(parseMeta(root, "meta.xml")).toMatch({
      kind: "meta",
      schema: {
        kind: "success",
      },
      warnings: [
        {
          message: "Use TypeScript comments instead",
        },
      ],
    });
  });

  it("returns schema parse errors for invalid TypeScript syntax", () => {
    const root = parseElement(`
      <meta>
        type Invalid = ;
      </meta>
    `);

    expect(parseMeta(root, "meta.xml")).toMatch({
      kind: "meta",
      schema: {
        kind: "error",
        errors: [
          {
            message:
              "Expected one of: '(', '{', '|', 'shared', string literal, identifier",
          },
        ],
      },
      warnings: [],
    });
  });
});
