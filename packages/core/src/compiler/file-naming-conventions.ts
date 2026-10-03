import { InternalError } from "../util/shared-types.js";
import type { AttributeValue } from "../xml/xml-attributes-checker.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";

export function checkMetaSourcePath(
  sourcePath: string,
): readonly InternalError[] {
  return checkSourcePath("meta.xml", sourcePath);
}

export function checkNamespaceSourcePath(
  name: AttributeValue<string>,
  sourcePath: string,
): readonly InternalError[] {
  const rawName = name.value.text;
  const expectedPathSuffix =
    rawName === DEFAULT_NAMESPACE
      ? "shared.xml"
      : rawName.concat("/shared.xml");
  return checkSourcePath(expectedPathSuffix, sourcePath);
}

export function checkTemplateOrToolSourcePath(
  name: AttributeValue<string>,
  namespace: AttributeValue<string> | undefined,
  sourcePath: string,
): readonly InternalError[] {
  const rawName = name.value.text;
  const rawNamespace = namespace?.value.text ?? DEFAULT_NAMESPACE;
  const expectedPathSuffix =
    rawNamespace === DEFAULT_NAMESPACE
      ? `${rawName}.xml`
      : `${rawNamespace}/${rawName}.xml`;
  return checkSourcePath(expectedPathSuffix, sourcePath);
}

function checkSourcePath(
  expectedPathSuffix: string,
  sourcePath: string,
): readonly InternalError[] {
  if (
    sourcePath === expectedPathSuffix ||
    sourcePath.endsWith("/".concat(expectedPathSuffix))
  ) {
    return [];
  } else {
    return [
      {
        span: {
          start: 0,
          end: 0,
        },
        message: `File path should match '**/${expectedPathSuffix}'`,
      },
    ];
  }
}
