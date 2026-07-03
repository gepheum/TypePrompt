import type {
  InterfaceDeclaration,
  ResolvedType,
  Type,
  TypeDeclaration,
} from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { getUnionMembers } from "../schema/unions.js";
import { checkNoAmbiguity } from "../util/casing.js";
import type {
  ResolvedTemplate,
  Template,
  TemplateFileParseResult,
  TemplateNamespace,
  TemplateParseError,
  TemplateParseErrors,
  Templates,
} from "./template-types.js";

function makeFileError(path: string, message: string): TemplateParseError {
  const pos = {
    offset: 0,
    position: { line: "", lineNumber: 1, columnNumber: 1 },
  };
  return { path, message, startPosition: pos, endPosition: pos };
}

export function mergeParseResults(
  files: readonly TemplateFileParseResult[],
): Templates | TemplateParseErrors {
  const errors: TemplateParseError[] = [];

  // Collect all templates with their source file paths.
  const allTemplates: Array<{ template: Template; path: string }> = [];
  for (const file of files) {
    for (const template of file.templates) {
      allTemplates.push({ template, path: file.path });
    }
  }

  // (1) Check namespace ambiguity across files.
  // Deduplicate by exact namespace value: multiple templates sharing the same
  // namespace is fine. We only want to catch case-insensitive clashes.
  const uniqueNamespacesByValue = new Map<string, string>(); // value → first file path
  for (const { template, path } of allTemplates) {
    if (!uniqueNamespacesByValue.has(template.namespace)) {
      uniqueNamespacesByValue.set(template.namespace, path);
    }
  }
  const namespaceEntries = [...uniqueNamespacesByValue.entries()].map(
    ([ns, path]) => ({ name: ns, start: 0, end: 0, path }),
  );
  for (const e of checkNoAmbiguity(namespaceEntries)) {
    errors.push(makeFileError(e.path ?? "", e.message));
  }

  // (2) Template name ambiguity within each namespace.
  const templatesByNamespace = new Map<
    string,
    Array<{ name: string; start: number; end: number; path: string }>
  >();
  for (const { template, path } of allTemplates) {
    const ns = template.namespace;
    if (!templatesByNamespace.has(ns)) {
      templatesByNamespace.set(ns, []);
    }
    templatesByNamespace
      .get(ns)!
      .push({ name: template.name, start: 0, end: 0, path });
  }
  for (const names of templatesByNamespace.values()) {
    for (const e of checkNoAmbiguity(names, { exactMatchIsConflict: true })) {
      errors.push(makeFileError(e.path ?? "", e.message));
    }
  }

  // (3) At most one top-level meta across all files.
  const allMetas = files.flatMap((f) =>
    f.metas.map((schema) => ({ schema, path: f.path })),
  );
  if (allMetas.length > 1) {
    for (const { path } of allMetas.slice(1)) {
      errors.push(
        makeFileError(
          path,
          "Multiple top-level meta schemas found; at most one is allowed across all files",
        ),
      );
    }
  }

  const topLevelMeta = allMetas[0]?.schema ?? null;

  if (topLevelMeta === null) {
    // (4) No top-level meta: no template may have a <meta/> element.
    for (const { template, path } of allTemplates) {
      if (template.metaNode !== null) {
        errors.push(
          makeFileError(
            path,
            `Template '${template.name}' has a <meta/> element but there is no top-level meta schema`,
          ),
        );
      }
    }
  } else {
    // (5) Validate each template's <meta/> element against the meta schema.
    const metaDecl = topLevelMeta.types["Meta"];
    if (metaDecl !== undefined && metaDecl.kind === "interface") {
      for (const { template, path } of allTemplates) {
        if (template.metaNode !== null) {
          errors.push(
            ...validateTemplateMeta(
              template,
              path,
              metaDecl,
              topLevelMeta.types,
            ),
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    return { kind: "error", errors };
  }

  // Build the success result — group templates by namespace.
  const namespaceMap = new Map<string, ResolvedTemplate[]>();
  for (const { template } of allTemplates) {
    const ns = template.namespace;
    if (!namespaceMap.has(ns)) {
      namespaceMap.set(ns, []);
    }
    const meta: { [property: string]: boolean | number | string } = {};
    if (template.metaNode !== null && topLevelMeta !== null) {
      const metaDecl = topLevelMeta.types["Meta"];
      if (metaDecl !== undefined && metaDecl.kind === "interface") {
        for (const [fieldName, field] of Object.entries(metaDecl.fields)) {
          const attrValue =
            template.metaNode.attributes[fieldName]?.decodedValue;
          if (attrValue !== undefined) {
            meta[fieldName] = coerceMetaValue(
              attrValue,
              field.type,
              topLevelMeta.types,
            );
          }
        }
      }
    }
    namespaceMap.get(ns)!.push({ template, meta });
  }

  const namespaces: TemplateNamespace[] = [];
  for (const [ns, templates] of namespaceMap.entries()) {
    namespaces.push({ namespace: ns, templates });
  }

  return { kind: "success", meta: topLevelMeta, namespaces };
}

// ---------------------------------------------------------------------------
// Private – meta validation
// ---------------------------------------------------------------------------

function validateTemplateMeta(
  template: Template,
  path: string,
  metaInterface: InterfaceDeclaration,
  types: { readonly [name: string]: TypeDeclaration },
): TemplateParseError[] {
  const errors: TemplateParseError[] = [];
  const attrs = template.metaNode!.attributes;

  // Unexpected attributes.
  for (const attrName of Object.keys(attrs)) {
    if (!(attrName in metaInterface.fields)) {
      errors.push(
        makeFileError(
          path,
          `Template '${template.name}': unexpected meta attribute '${attrName}'`,
        ),
      );
    }
  }

  // Required fields must be present; all present values must be valid.
  for (const [fieldName, field] of Object.entries(metaInterface.fields)) {
    const attrValue = attrs[fieldName]?.decodedValue;
    if (attrValue === undefined) {
      if (!field.optional) {
        errors.push(
          makeFileError(
            path,
            `Template '${template.name}': missing required meta attribute '${fieldName}'`,
          ),
        );
      }
      continue;
    }
    const resolved = resolveType(field.type, types);
    const valueError = validateMetaValue(
      attrValue,
      resolved,
      fieldName,
      template.name,
      path,
      types,
    );
    if (valueError !== null) {
      errors.push(valueError);
    }
  }

  return errors;
}

function validateMetaValue(
  value: string,
  resolved: ResolvedType,
  fieldName: string,
  templateName: string,
  path: string,
  types: { readonly [name: string]: TypeDeclaration },
): TemplateParseError | null {
  switch (resolved.kind) {
    case "primitive": {
      switch (resolved.primitive) {
        case "boolean":
          if (value !== "true" && value !== "false") {
            return makeFileError(
              path,
              `Template '${templateName}': meta attribute '${fieldName}' must be 'true' or 'false'`,
            );
          }
          return null;
        case "number":
          if (value.trim() === "" || isNaN(Number(value))) {
            return makeFileError(
              path,
              `Template '${templateName}': meta attribute '${fieldName}' must be a number`,
            );
          }
          return null;
        case "int":
          if (!/^-?\d+$/.test(value.trim())) {
            return makeFileError(
              path,
              `Template '${templateName}': meta attribute '${fieldName}' must be an integer`,
            );
          }
          return null;
        default: // "string"
          return null;
      }
    }
    case "union": {
      const members = getUnionMembers(resolved, types);
      if (members.kind === "strings" && !members.values.has(value)) {
        const expected = [...members.values].map((v) => `'${v}'`).join(", ");
        return makeFileError(
          path,
          `Template '${templateName}': meta attribute '${fieldName}' must be one of ${expected}`,
        );
      }
      return null;
    }
    case "string-literal":
      if (value !== resolved.value) {
        return makeFileError(
          path,
          `Template '${templateName}': meta attribute '${fieldName}' must be '${resolved.value}'`,
        );
      }
      return null;
    default:
      return null;
  }
}

function coerceMetaValue(
  value: string,
  type: Type,
  types: { readonly [name: string]: TypeDeclaration },
): boolean | number | string {
  const resolved = resolveType(type, types);
  if (resolved.kind === "primitive") {
    switch (resolved.primitive) {
      case "boolean":
        return value === "true";
      case "number":
        return Number(value);
      case "int":
        return parseInt(value, 10);
      case "string":
        return value;
    }
  } else {
    return value; // union of string literals
  }
}
