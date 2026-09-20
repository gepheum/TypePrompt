import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { AttributeValue } from "../xml/xml-attributes-checker.js";
import {
  checkMetaSourcePath,
  checkNamespaceSourcePath,
  checkTemplateOrToolSourcePath,
} from "./file-naming-conventions.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAttr<T extends string | undefined>(text: T): AttributeValue<T> {
  if (text === undefined) {
    return undefined as AttributeValue<T>;
  }
  return {
    nameSpan: { start: 0, end: 4 },
    value: {
      text: text as NonNullable<T>,
      start: 5,
      end: 5 + text.length,
    },
  } as AttributeValue<T>;
}

// ---------------------------------------------------------------------------
// checkMetaSourcePath
// ---------------------------------------------------------------------------

describe("checkMetaSourcePath", () => {
  it("succeeds for exact filename 'meta.xml'", () => {
    expect(checkMetaSourcePath("meta.xml")).toMatch([]);
  });

  it("succeeds for nested path ending in '/meta.xml'", () => {
    expect(checkMetaSourcePath("prompts/meta.xml")).toMatch([]);
  });

  it("succeeds for deeply nested path ending in '/meta.xml'", () => {
    expect(checkMetaSourcePath("src/features/prompts/meta.xml")).toMatch([]);
  });

  it("reports an error when the filename is not 'meta.xml'", () => {
    expect(checkMetaSourcePath("prompts/other.xml")).toMatch([
      {
        message: "File path should match '**/meta.xml'",
      },
    ]);
  });

  it("reports an error when filename has an extension suffix", () => {
    expect(checkMetaSourcePath("meta.xml.bak")).toMatch([
      {
        message: "File path should match '**/meta.xml'",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// checkNamespaceSourcePath
// ---------------------------------------------------------------------------

describe("checkNamespaceSourcePath", () => {
  it("succeeds for default Main namespace with 'shared.xml'", () => {
    expect(checkNamespaceSourcePath(makeAttr("Main"), "shared.xml")).toMatch(
      [],
    );
  });

  it("succeeds for default Main namespace with 'prompts/shared.xml'", () => {
    expect(
      checkNamespaceSourcePath(makeAttr("Main"), "prompts/shared.xml"),
    ).toMatch([]);
  });

  it("reports an error when default Main namespace file is not 'shared.xml'", () => {
    expect(
      checkNamespaceSourcePath(makeAttr("Main"), "prompts/custom.xml"),
    ).toMatch([
      {
        message: "File path should match '**/shared.xml'",
      },
    ]);
  });

  it("succeeds for custom namespace with '<Namespace>/shared.xml'", () => {
    expect(
      checkNamespaceSourcePath(makeAttr("Billing"), "Billing/shared.xml"),
    ).toMatch([]);
  });

  it("succeeds for custom namespace with 'prompts/<Namespace>/shared.xml'", () => {
    expect(
      checkNamespaceSourcePath(
        makeAttr("Billing"),
        "prompts/Billing/shared.xml",
      ),
    ).toMatch([]);
  });

  it("reports an error when custom namespace file is in the wrong directory", () => {
    expect(
      checkNamespaceSourcePath(makeAttr("Billing"), "prompts/shared.xml"),
    ).toMatch([
      {
        message: "File path should match '**/Billing/shared.xml'",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// checkTemplateOrToolSourcePath
// ---------------------------------------------------------------------------

describe("checkTemplateOrToolSourcePath", () => {
  it("succeeds for template/tool in default namespace with '<Name>.xml'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Translate"),
        undefined,
        "Translate.xml",
      ),
    ).toMatch([]);
  });

  it("succeeds for template/tool in default namespace with 'prompts/<Name>.xml'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Translate"),
        undefined,
        "prompts/Translate.xml",
      ),
    ).toMatch([]);
  });

  it("succeeds when explicit namespace is 'Main'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Translate"),
        makeAttr("Main"),
        "prompts/Translate.xml",
      ),
    ).toMatch([]);
  });

  it("reports an error when template/tool in default namespace filename does not match", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Translate"),
        undefined,
        "prompts/Wrong.xml",
      ),
    ).toMatch([
      {
        message: "File path should match '**/Translate.xml'",
      },
    ]);
  });

  it("succeeds for template/tool with custom namespace in '<Namespace>/<Name>.xml'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Summarize"),
        makeAttr("Finance"),
        "Finance/Summarize.xml",
      ),
    ).toMatch([]);
  });

  it("succeeds for template/tool with custom namespace in 'prompts/<Namespace>/<Name>.xml'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Summarize"),
        makeAttr("Finance"),
        "prompts/Finance/Summarize.xml",
      ),
    ).toMatch([]);
  });

  it("reports an error when custom namespace template/tool is missing namespace directory", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Summarize"),
        makeAttr("Finance"),
        "prompts/Summarize.xml",
      ),
    ).toMatch([
      {
        message: "File path should match '**/Finance/Summarize.xml'",
      },
    ]);
  });

  it("reports an error when custom namespace template/tool is in a different namespace directory", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Summarize"),
        makeAttr("Finance"),
        "prompts/Legal/Summarize.xml",
      ),
    ).toMatch([
      {
        message: "File path should match '**/Finance/Summarize.xml'",
      },
    ]);
  });
});
