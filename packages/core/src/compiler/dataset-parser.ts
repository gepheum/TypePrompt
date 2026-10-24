import type { StrictJsonValue } from "../json/json-types.js";
import { parseYaml } from "../json/yaml-parser.js";
import type { InternalError, InternalErrors } from "../util/shared-types.js";
import { expectIdentifier } from "../xml/xml-attributes-checker.js";
import { checkKnownXmlAttributes } from "../xml/xml-entities.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Dataset } from "./compiler-types.js";
import { checkDatasetSourcePath } from "./file-naming-conventions.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a top-level <dataset> element. The result has yet to be validated. */
export function parseDataset(
  datasetNode: ElementNode,
): Dataset | InternalErrors {
  const attrs = checkKnownXmlAttributes(datasetNode, {
    for: expectIdentifier({
      format: "PascalCase",
      optional: false,
    }),
    namespace: expectIdentifier({
      format: "PascalCase",
      optional: true,
    }),
  });
  if (attrs.kind === "error") {
    return attrs;
  }
  const errors = [...attrs.errors];
  const warnings: InternalError[] = [];

  const { for: forTemplate, namespace } = attrs.attributes;

  // Raise a warning if the file path doesn't match the file naming conventions.
  warnings.push(
    ...checkDatasetSourcePath(forTemplate, namespace, datasetNode.path),
  );

  let items: StrictJsonValue | null = null;
  const textContent = extractTextContent(datasetNode, "yaml");
  if (textContent.kind === "error") {
    errors.push(...textContent.errors);
  } else {
    warnings.push(...textContent.warnings);
    const parsed = parseYaml(textContent.text);
    if (parsed.kind === "error") {
      errors.push(...parsed.errors);
    } else {
      items = parsed;
    }
  }

  if (errors.length >= 1) {
    return { kind: "error", errors };
  }

  return {
    kind: "dataset",
    tag: datasetNode.tag,
    for: forTemplate.value,
    namespace: namespace?.value ?? null,
    items: items!,
    warnings,
  };
}
