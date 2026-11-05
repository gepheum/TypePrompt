import { stringify } from "yaml";
import type { CompilationResult } from "../compiler/compiler-types.js";
import { DEFAULT_NAMESPACE } from "../compiler/default-namespace.js";
import { DEFAULT_CONFIG_YAML } from "../config/config-parser.js";
import { DEFAULT_SECRETS_YAML } from "../config/secrets-parser.js";
import { makeExampleValue } from "../schema/example-maker.js";

/**
 * Generates initial skeleton content for newly created TypePrompt files.
 *
 * Rules:
 * - "typeprompt.yaml" / "typeprompt.yml" -> DEFAULT_CONFIG_YAML
 * - ".typeprompt.secrets.yaml" / ".typeprompt.secrets.yml" -> DEFAULT_SECRETS_YAML
 * - "meta.tp" -> <meta>
 * - ".../${dirname}/shared.tp" -> <namespace name="${dirname}"> (or "Main" if dirname is not PascalCase)
 * - "Foo.tp" (PascalCase) -> <template name="Foo"[ namespace="${dirname}"]>
 * - "foo.tp" (camelCase) -> <tool name="foo"[ namespace="${dirname}"]>
 * - "Foo.play.tp" -> <playground for="Foo"[ namespace="${dirname}"]>
 *
 * A namespace attribute is added when `dirname` exists in `compilationResult.namespaces` (and is not Main).
 * If the filename does not match any recognized TypePrompt file, returns null.
 */
export function generateFileTemplate(
  filePath: string,
  compilationResult: CompilationResult | null,
): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const fileName =
    lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const parent = lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
  const prevSlash = parent.lastIndexOf("/");
  const dirname = prevSlash >= 0 ? parent.slice(prevSlash + 1) : parent;

  if (fileName === "typeprompt.yaml" || fileName === "typeprompt.yml") {
    return DEFAULT_CONFIG_YAML;
  }

  if (
    fileName === ".typeprompt.secrets.yaml" ||
    fileName === ".typeprompt.secrets.yml"
  ) {
    return DEFAULT_SECRETS_YAML;
  }

  if (fileName === "meta.tp") {
    return [
      //
      "<meta>",
      "  type Meta = {};",
      "</meta>\n",
    ].join("\n");
  }

  if (fileName === "shared.tp") {
    const nsName = PASCAL_CASE_RE.test(dirname) ? dirname : DEFAULT_NAMESPACE;
    return [
      `<namespace name="${nsName}">`,
      "  // Shared types go here.",
      "</namespace>\n",
    ].join("\n");
  }

  const isNamespace =
    compilationResult &&
    dirname in compilationResult.namespaces &&
    dirname !== DEFAULT_NAMESPACE;
  const nsAttr = isNamespace ? ` namespace="${dirname}"` : "";

  if (fileName.endsWith(".play.tp")) {
    const name = fileName.slice(0, -".play.tp".length);
    if (!PASCAL_CASE_RE.test(name) && !CAMEL_CASE_RE.test(name)) {
      return null;
    }
    const namespaceName = isNamespace ? dirname : DEFAULT_NAMESPACE;
    const samplesYaml = makeSamplesYaml(name, namespaceName, compilationResult);
    return [
      `<playground for="${name}"${nsAttr}>`,
      "  <model>",
      "    model: openai/gpt-4o",
      "  </model>",
      "",
      "  <samples>",
      samplesYaml,
      "  </samples>",
      "</playground>\n",
    ].join("\n");
  }

  if (fileName.endsWith(".tp")) {
    const name = fileName.slice(0, -".tp".length);

    if (PASCAL_CASE_RE.test(name)) {
      return [
        `<template name="${name}"${nsAttr}>`,
        "  <schema>",
        "    type Input = {};",
        "    type Output = {};",
        "  </schema>",
        "",
        "  <system>",
        "    <!-- System prompt goes here. -->",
        "  </system>",
        "",
        "  <user>",
        "    <!-- User prompt goes here. -->",
        "  </user>",
        "</template>\n",
      ].join("\n");
    }

    if (CAMEL_CASE_RE.test(name)) {
      return [
        `<tool name="${name}"${nsAttr}>`,
        "  <description>",
        "    <!-- Tool description goes here. -->",
        "  </description>",
        "",
        "  <schema>",
        "    type Input = {};",
        "    type Output = {};",
        "  </schema>",
        "</tool>\n",
      ].join("\n");
    }
  }

  return null;
}

const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
const CAMEL_CASE_RE = /^[a-z][a-zA-Z0-9]*$/;

function makeSamplesYaml(
  templateName: string,
  namespaceName: string,
  compilationResult: CompilationResult | null,
): string {
  let inputExample: unknown = {};
  if (compilationResult?.templates) {
    const templateId = `${namespaceName}:${templateName}`;
    const templateValidation = compilationResult.templates[templateId];
    if (templateValidation && templateValidation.kind === "template") {
      const inputDecl = templateValidation.schema.typeDeclarations["Input"];
      if (inputDecl) {
        inputExample = makeExampleValue({
          type: inputDecl.valueType,
          schema: templateValidation.schema,
        });
      }
    }
  }

  const yamlStr = stringify([{ input: inputExample }]).trimEnd();
  return yamlStr
    .split("\n")
    .map((line) => "    " + line)
    .join("\n");
}
