import type { Schema, Type } from "../schema/schema-types.js";
import { resolveType } from "../schema/type-resolver.js";
import { checkNoAmbiguity } from "../util/casing.js";
import type {
  ResolvedSchema,
  ResolvedTemplate,
  ResolvedTypeDeclaration,
  Template,
  TemplateFileParseResult,
  TemplateNamespace,
  TemplateParseError,
  TemplateParseErrors,
  ResolvedType as TemplateResolvedType,
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
    if (metaDecl !== undefined) {
      // TODO
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
      // TODO
    }
    namespaceMap.get(ns)!.push({
      name: template.name,
      namespace: template.namespace,
      meta,
      schema: resolveSchema(template.schema),
      args: template.args,
      content: template.content,
      xmlContent: template.xmlContent,
    });
  }

  const namespaces: TemplateNamespace[] = [];
  for (const [ns, templates] of namespaceMap.entries()) {
    namespaces.push({ namespace: ns, templates });
  }

  return {
    kind: "success",
    meta: topLevelMeta !== null ? resolveSchema(topLevelMeta) : null,
    namespaces,
  };
}

// ---------------------------------------------------------------------------
// Private – schema resolution
// ---------------------------------------------------------------------------

function resolveSchema(schema: Schema): ResolvedSchema {
  const types: ResolvedTypeDeclaration[] = [];

  // All unions — both named type aliases and anonymous inline unions — are in
  // typeToNamingHint, so one loop covers both cases.
  for (const [type, hint] of schema.typeToNamingHint.entries()) {
    if (type.kind !== "union") continue;
    const members = schema.unionToMembers.get(type);
    if (!members) continue;

    if (members.kind === "strings") {
      types.push({
        kind: "string-union",
        namePieces: hint.namePieces,
        doc: hint.doc ?? "",
        values: [...members.values],
      });
    } else {
      types.push({
        kind: "interface-union",
        namePieces: hint.namePieces,
        doc: hint.doc ?? "",
        members: Object.entries(members.members).map(([kind, iface]) => ({
          kind,
          namePieces: schema.typeToNamingHint.get(iface)!.namePieces,
        })),
        kindFieldName: members.kindFieldName,
      });
    }
  }

  const typeAliases: { [name: string]: TemplateResolvedType } = {};
  for (const [name, decl] of Object.entries(schema.types)) {
    if (decl.kind === "type") {
      typeAliases[name] = convertType(decl.valueType, schema);
    } else {
      typeAliases[name] = { kind: "ref", namePieces: [name] };
    }
  }

  return { types, typeAliases };
}

function convertType(type: Type, schema: Schema): TemplateResolvedType {
  switch (type.kind) {
    case "type-name": {
      const resolved = resolveType(type, schema.types);
      if (resolved.kind === "primitive") {
        return { kind: "primitive", primitive: resolved.primitive };
      } else {
        // Named reference — use the declared type name.
        return { kind: "ref", namePieces: [type.name.text] };
      }
    }
    case "array":
      return {
        kind: "array",
        elementType: convertType(type.elementType, schema),
      };
    case "interface":
    case "union":
      // Inline anonymous type — derive name from the traversal hint.
      return {
        kind: "ref",
        namePieces: schema.typeToNamingHint.get(type)?.namePieces ?? [],
      };
    case "string-literal":
      // string-literal — not a valid standalone field type.
      return { kind: "primitive", primitive: "string" };
  }
}
