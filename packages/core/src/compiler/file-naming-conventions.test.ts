import { expect } from "buckwheat";
import { describe, it } from "mocha";

import type { AttributeValue } from "../xml/xml-attributes-checker.js";
import {
  checkMetaSourcePath,
  checkNamespaceSourcePath,
  checkPlaygroundSourcePath,
  checkTemplateOrToolSourcePath,
} from "./file-naming-conventions.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAttr<T extends string>(text: T): AttributeValue<T> {
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
  it("succeeds for exact filename 'meta.tp'", () => {
    expect(checkMetaSourcePath("meta.tp")).toMatch([]);
  });

  it("succeeds for nested path ending in '/meta.tp'", () => {
    expect(checkMetaSourcePath("prompts/meta.tp")).toMatch([]);
  });

  it("succeeds for deeply nested path ending in '/meta.tp'", () => {
    expect(checkMetaSourcePath("src/features/prompts/meta.tp")).toMatch([]);
  });

  it("reports an error when the filename is not 'meta.tp'", () => {
    expect(checkMetaSourcePath("prompts/other.tp")).toMatch([
      {
        message: "File path should match '**/meta.tp'",
      },
    ]);
  });

  it("reports an error when filename has an extension suffix", () => {
    expect(checkMetaSourcePath("meta.tp.bak")).toMatch([
      {
        message: "File path should match '**/meta.tp'",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// checkNamespaceSourcePath
// ---------------------------------------------------------------------------

describe("checkNamespaceSourcePath", () => {
  it("succeeds for default Main namespace with 'shared.tp'", () => {
    expect(checkNamespaceSourcePath(makeAttr("Main"), "shared.tp")).toMatch([]);
  });

  it("succeeds for default Main namespace with 'prompts/shared.tp'", () => {
    expect(
      checkNamespaceSourcePath(makeAttr("Main"), "prompts/shared.tp"),
    ).toMatch([]);
  });

  it("reports an error when default Main namespace file is not 'shared.tp'", () => {
    expect(
      checkNamespaceSourcePath(makeAttr("Main"), "prompts/custom.tp"),
    ).toMatch([
      {
        message: "File path should match '**/shared.tp'",
      },
    ]);
  });

  it("succeeds for custom namespace with '<Namespace>/shared.tp'", () => {
    expect(
      checkNamespaceSourcePath(makeAttr("Billing"), "Billing/shared.tp"),
    ).toMatch([]);
  });

  it("succeeds for custom namespace with 'prompts/<Namespace>/shared.tp'", () => {
    expect(
      checkNamespaceSourcePath(
        makeAttr("Billing"),
        "prompts/Billing/shared.tp",
      ),
    ).toMatch([]);
  });

  it("reports an error when custom namespace file is in the wrong directory", () => {
    expect(
      checkNamespaceSourcePath(makeAttr("Billing"), "prompts/shared.tp"),
    ).toMatch([
      {
        message: "File path should match '**/Billing/shared.tp'",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// checkTemplateOrToolSourcePath
// ---------------------------------------------------------------------------

describe("checkTemplateOrToolSourcePath", () => {
  it("succeeds for template/tool in default namespace with '<Name>.tp'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Translate"),
        undefined,
        "Translate.tp",
      ),
    ).toMatch([]);
  });

  it("succeeds for template/tool in default namespace with 'prompts/<Name>.tp'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Translate"),
        undefined,
        "prompts/Translate.tp",
      ),
    ).toMatch([]);
  });

  it("succeeds when explicit namespace is 'Main'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Translate"),
        makeAttr("Main"),
        "prompts/Translate.tp",
      ),
    ).toMatch([]);
  });

  it("reports an error when template/tool in default namespace filename does not match", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Translate"),
        undefined,
        "prompts/Wrong.tp",
      ),
    ).toMatch([
      {
        message: "File path should match '**/Translate.tp'",
      },
    ]);
  });

  it("succeeds for template/tool with custom namespace in '<Namespace>/<Name>.tp'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Summarize"),
        makeAttr("Finance"),
        "Finance/Summarize.tp",
      ),
    ).toMatch([]);
  });

  it("succeeds for template/tool with custom namespace in 'prompts/<Namespace>/<Name>.tp'", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Summarize"),
        makeAttr("Finance"),
        "prompts/Finance/Summarize.tp",
      ),
    ).toMatch([]);
  });

  it("reports an error when custom namespace template/tool is missing namespace directory", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Summarize"),
        makeAttr("Finance"),
        "prompts/Summarize.tp",
      ),
    ).toMatch([
      {
        message: "File path should match '**/Finance/Summarize.tp'",
      },
    ]);
  });

  it("reports an error when custom namespace template/tool is in a different namespace directory", () => {
    expect(
      checkTemplateOrToolSourcePath(
        makeAttr("Summarize"),
        makeAttr("Finance"),
        "prompts/Legal/Summarize.tp",
      ),
    ).toMatch([
      {
        message: "File path should match '**/Finance/Summarize.tp'",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// checkPlaygroundSourcePath
// ---------------------------------------------------------------------------

describe("checkPlaygroundSourcePath", () => {
  it("succeeds for default namespace playground ending in '<Name>.play.tp'", () => {
    expect(
      checkPlaygroundSourcePath(
        makeAttr("Translate"),
        undefined,
        "Translate.play.tp",
      ),
    ).toMatch([]);
  });

  it("succeeds for default namespace playground in nested folder", () => {
    expect(
      checkPlaygroundSourcePath(
        makeAttr("Translate"),
        undefined,
        "prompts/Translate.play.tp",
      ),
    ).toMatch([]);
  });

  it("succeeds for custom namespace playground in '<Namespace>/<Name>.play.tp'", () => {
    expect(
      checkPlaygroundSourcePath(
        makeAttr("Translate"),
        makeAttr("Legal"),
        "prompts/Legal/Translate.play.tp",
      ),
    ).toMatch([]);
  });

  it("reports an error when default namespace playground is named without .play.tp", () => {
    expect(
      checkPlaygroundSourcePath(
        makeAttr("Translate"),
        undefined,
        "prompts/Translate.tp",
      ),
    ).toMatch([
      {
        message: "File path should match '**/Translate.play.tp'",
      },
    ]);
  });

  it("reports an error when custom namespace playground is missing namespace directory", () => {
    expect(
      checkPlaygroundSourcePath(
        makeAttr("Translate"),
        makeAttr("Legal"),
        "prompts/Translate.play.tp",
      ),
    ).toMatch([
      {
        message: "File path should match '**/Legal/Translate.play.tp'",
      },
    ]);
  });
});
