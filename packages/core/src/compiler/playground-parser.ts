import type { StrictJsonValue } from "../json/json-types.js";
import { parseYaml } from "../json/yaml-parser.js";
import type { InternalError, InternalErrors } from "../util/shared-types.js";
import { expectIdentifier } from "../xml/xml-attributes-checker.js";
import {
  checkAllAreKnownElements,
  checkKnownXmlAttributes,
} from "../xml/xml-entities.js";
import type { ElementNode } from "../xml/xml-types.js";
import type { Playground } from "./compiler-types.js";
import { checkPlaygroundSourcePath } from "./file-naming-conventions.js";
import { extractTextContent } from "./text-extractor.js";

/** Parses a top-level <playground> element. The result has yet to be validated. */
export function parsePlayground(
  playgroundNode: ElementNode,
): Playground | InternalErrors {
  const attrs = checkKnownXmlAttributes(playgroundNode, {
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
    ...checkPlaygroundSourcePath(forTemplate, namespace, playgroundNode.path),
  );

  const children = checkAllAreKnownElements(
    playgroundNode.children,
    ["model", "samples"] as const,
    " in <playground>",
    errors,
  );

  let modelNode: ElementNode | null = null;
  let samplesNode: ElementNode | null = null;
  for (const [tag, child] of children) {
    if (tag === "model") {
      if (modelNode) {
        errors.push({
          span: child.tag,
          message: "Duplicate <model> element in <playground>",
        });
      } else {
        modelNode = child;
      }
    } else if (tag === "samples") {
      if (samplesNode) {
        errors.push({
          span: child.tag,
          message: "Duplicate <samples> element in <playground>",
        });
      } else {
        samplesNode = child;
      }
    }
  }

  let model: StrictJsonValue | null = null;
  if (!modelNode) {
    errors.push({
      span: playgroundNode.tag,
      message: "Missing <model> element in <playground>",
    });
  } else {
    const modelAttrs = checkKnownXmlAttributes(modelNode, {});
    errors.push(...modelAttrs.errors);

    const textContent = extractTextContent(modelNode, "yaml");
    if (textContent.kind === "error") {
      errors.push(...textContent.errors);
    } else {
      warnings.push(...textContent.warnings);
      const parsed = parseYaml(textContent.text);
      if (parsed.kind === "error") {
        errors.push(...parsed.errors);
      } else {
        model = parsed;
      }
    }
  }

  let samples: StrictJsonValue | null = null;
  if (!samplesNode) {
    errors.push({
      span: playgroundNode.tag,
      message: "Missing <samples> element in <playground>",
    });
  } else {
    const samplesAttrs = checkKnownXmlAttributes(samplesNode, {});
    errors.push(...samplesAttrs.errors);

    const textContent = extractTextContent(samplesNode, "yaml");
    if (textContent.kind === "error") {
      errors.push(...textContent.errors);
    } else {
      warnings.push(...textContent.warnings);
      const parsed = parseYaml(textContent.text);
      if (parsed.kind === "error") {
        errors.push(...parsed.errors);
      } else {
        samples = parsed;
      }
    }
  }

  if (errors.length >= 1) {
    return { kind: "error", errors };
  }

  return {
    kind: "playground",
    tag: playgroundNode.tag,
    for: forTemplate.value,
    namespace: namespace?.value ?? null,
    model: model!,
    samples: samples!,
    warnings,
  };
}
