import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { InternalErrors } from "../util/shared-types.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Namespace } from "./compiler-types.js";
import { parseNamespace as parseNamespaceCore } from "./namespace-parser.js";

function parseNamespace(
  namespaceNode: ElementNode,
  sourcePath?: string,
): Namespace | InternalErrors {
  if (sourcePath !== undefined) {
    return parseNamespaceCore({ ...namespaceNode, path: sourcePath });
  }
  return parseNamespaceCore(namespaceNode);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseElement(xml: string, path = "prompts/Main.xml"): ElementNode {
  const result = parseXmlDocument(xml, path);
  if (result.kind !== "success") {
    throw new Error(
      `Parse failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.root;
}

// ---------------------------------------------------------------------------
// parseNamespace
// ---------------------------------------------------------------------------

describe("parseNamespace", () => {
  it("parses the default Main namespace with shared.xml source path", () => {
    const root = parseElement(`
      <namespace name="Main">
        type SharedUser = {
          id: string;
        };
      </namespace>
    `);

    expect(parseNamespace(root, "prompts/shared.xml")).toMatch({
      kind: "namespace",
      name: { text: "Main" },
      schema: {
        kind: "success",
        typeDeclarations: {
          SharedUser: {
            kind: "type",
            name: { text: "SharedUser" },
            valueType: {
              kind: "interface",
              fields: {
                id: {
                  name: { text: "id" },
                  type: {
                    kind: "primitive",
                    primitive: { text: "string" },
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

  it("populates definition links when namespace schema types reference other types", () => {
    const root = parseElement(`
      <namespace name="Main">
        type Role = "admin" | "user";
        type SharedUser = {
          id: string;
          role: Role;
        };
      </namespace>
    `);

    const result = parseNamespace(root, "prompts/shared.xml");
    if (result.kind !== "namespace") throw new Error();
    if (result.schema.kind !== "success") throw new Error();
    expect(result.schema.definitionLinks).toMatch([
      {
        reference: { path: "prompts/shared.xml" },
        definition: { path: "prompts/shared.xml" },
      },
    ]);
  });

  it("parses a custom namespace with matching subdirectory source path", () => {
    const root = parseElement(`
      <namespace name="Billing">
        type Invoice = {
          amount: number;
        };
      </namespace>
    `);

    expect(parseNamespace(root, "prompts/Billing/shared.xml")).toMatch({
      kind: "namespace",
      name: { text: "Billing" },
      schema: {
        kind: "success",
        typeDeclarations: {
          Invoice: {
            kind: "type",
            name: { text: "Invoice" },
            valueType: {
              kind: "interface",
              fields: {
                amount: {
                  name: { text: "amount" },
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

  it("parses an empty namespace with no type declarations", () => {
    const root = parseElement('<namespace name="Main"></namespace>');

    expect(parseNamespace(root, "prompts/shared.xml")).toMatch({
      kind: "namespace",
      name: { text: "Main" },
      schema: {
        kind: "success",
        typeDeclarations: {},
      },
      warnings: [],
    });
  });

  it("reports an error when the name attribute is missing", () => {
    const root = parseElement(`
      <namespace>
        type Foo = string;
      </namespace>
    `);

    expect(parseNamespace(root, "shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Missing required attribute 'name'",
        },
      ],
    });
  });

  it("rejects non-PascalCase namespace names", () => {
    const root = parseElement('<namespace name="billingService" />');

    expect(parseNamespace(root, "billingService/shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'name': expected a PascalCase identifier",
        },
      ],
    });
  });

  it("rejects kebab-case namespace names", () => {
    const root = parseElement('<namespace name="billing-service" />');

    expect(parseNamespace(root, "billing-service/shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'name': expected a PascalCase identifier",
        },
      ],
    });
  });

  it("rejects namespace names starting with a digit", () => {
    const root = parseElement('<namespace name="1Billing" />');

    expect(parseNamespace(root, "1Billing/shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message:
            "Invalid value for attribute 'name': expected a PascalCase identifier",
        },
      ],
    });
  });

  it("reports an error for unexpected attributes on <namespace>", () => {
    const root = parseElement('<namespace name="Billing" version="1" />');

    expect(parseNamespace(root, "Billing/shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected attribute 'version'",
        },
      ],
    });
  });

  it("rejects reserved namespace name 'Meta'", () => {
    const root = parseElement('<namespace name="Meta" />');

    expect(parseNamespace(root, "Meta/shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Namespace name cannot be 'Meta'",
        },
      ],
    });
  });

  it("rejects reserved namespace name 'Schema'", () => {
    const root = parseElement('<namespace name="Schema" />');

    expect(parseNamespace(root, "Schema/shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Namespace name cannot be 'Schema'",
        },
      ],
    });
  });

  it("rejects case-insensitive variations of reserved namespace names", () => {
    const root = parseElement('<namespace name="META" />');

    expect(parseNamespace(root, "META/shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Namespace name cannot be 'Meta' (case-insensitive)",
        },
      ],
    });
  });

  it("rejects improper casing of the default Main namespace", () => {
    const root = parseElement('<namespace name="MAIN" />');

    expect(parseNamespace(root, "shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Use proper casing: 'Main' instead of 'MAIN'",
        },
      ],
    });
  });

  it("emits a warning when Main namespace file path does not match '**/shared.xml'", () => {
    const root = parseElement('<namespace name="Main" />');

    expect(parseNamespace(root, "prompts/custom.xml")).toMatch({
      kind: "namespace",
      name: { text: "Main" },
      warnings: [
        {
          message: "File path should match '**/shared.xml'",
        },
      ],
    });
  });

  it("emits a warning when custom namespace file path does not match '**/{Name}/shared.xml'", () => {
    const root = parseElement('<namespace name="Billing" />');

    expect(parseNamespace(root, "prompts/shared.xml")).toMatch({
      kind: "namespace",
      name: { text: "Billing" },
      warnings: [
        {
          message: "File path should match '**/Billing/shared.xml'",
        },
      ],
    });
  });

  it("reports an error when <namespace> contains child XML elements", () => {
    const root = parseElement(`
      <namespace name="Billing">
        <unexpectedChild />
      </namespace>
    `);

    expect(parseNamespace(root, "Billing/shared.xml")).toMatch({
      kind: "error",
      errors: [
        {
          message: "Unexpected element <unexpectedChild>",
        },
      ],
    });
  });

  it("emits a warning when <namespace> contains XML comments", () => {
    const root = parseElement(`
      <namespace name="Billing">
        <!-- Use TypeScript comments instead -->
        type Status = "active" | "inactive";
      </namespace>
    `);

    expect(parseNamespace(root, "Billing/shared.xml")).toMatch({
      kind: "namespace",
      name: { text: "Billing" },
      warnings: [
        {
          message: "Use TypeScript comments instead",
        },
      ],
    });
  });

  it("returns schema parse errors for invalid TypeScript syntax", () => {
    const root = parseElement(`
      <namespace name="Billing">
        type Invalid = ;
      </namespace>
    `);

    expect(parseNamespace(root, "Billing/shared.xml")).toMatch({
      kind: "namespace",
      name: { text: "Billing" },
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
