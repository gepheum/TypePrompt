import { EMPTY_SCHEMA } from "../schema/empty-schema.js";
import {
  hashSchema,
  schemasAreEquivalent,
} from "../schema/schema-equivalence.js";
import type { Schema, TypeDeclarations } from "../schema/schema-types.js";
import { checkNameConflicts } from "../util/casing.js";
import {
  combineHashes,
  combineHashesUnordered,
  hashString,
} from "../util/hasher.js";
import type { LineFinderData } from "../util/line-finder.js";
import { createLineFinder } from "../util/line-finder.js";
import type {
  DefinitionLink,
  InternalError,
  InternalErrors,
  TextSpan,
} from "../util/shared-types.js";
import { ValidationResultBuilder } from "../util/validation-result-builder.js";
import { checkAllAreKnownElements } from "../xml/xml-entities.js";
import { parseXmlDocument } from "../xml/xml-parser.js";
import type { ElementNode, XmlDocument } from "../xml/xml-types.js";
import type {
  CompilationResult,
  Meta,
  Namespace,
  NamespaceResult,
  SchemaOrError,
  SourceFileParseResult,
  Template,
  TemplateValidationResult,
  Tool,
  ToolValidationResult,
  ValidCompilationResult,
} from "./compiler-types.js";
import { DEFAULT_NAMESPACE } from "./default-namespace.js";
import { parseMeta } from "./meta-parser.js";
import { parseNamespace } from "./namespace-parser.js";
import { parseTemplate } from "./template-parser.js";
import { validateTemplate } from "./template-validator.js";
import { parseTool } from "./tool-parser.js";
import { validateTool } from "./tool-validator.js";

export function compile(
  pathToContent: { readonly [path: string]: string },
  options: {
    readonly cache: CompilationResult | null;
    readonly patchBase: ValidCompilationResult | null;
  },
): CompilationResult {
  const result = new CompilationResultImpl(options);

  const cache =
    options.cache?.patchBase === options.patchBase ? options.cache : null;

  for (const [path, content] of Object.entries(pathToContent)) {
    const cachedFile = cache?.sourceFiles[path];
    let outSourceFile: SourceFileParseResult;
    if (cachedFile && cachedFile.content === content) {
      outSourceFile = cachedFile;
    } else {
      outSourceFile = parseSourceFile(path, content, options);
    }
    result.sourceFiles[path] = outSourceFile;
  }

  result.validate(cache);

  return result;
}

export function parseSourceFile(
  path: string,
  content: string,
  options: {
    readonly patchBase: CompilationResult | null;
  },
): SourceFileParseResult {
  const xmlDocument = parseXmlDocument(content, path);

  const result = new SourceFileParseResultImpl(path, content, xmlDocument);
  const { errors } = result.parseResult;

  if (xmlDocument.kind === "error") {
    errors.push(...xmlDocument.errors);
    if (
      xmlDocument.root === null ||
      (xmlDocument.root.closingTag === undefined &&
        !xmlDocument.root.isSelfClosing)
    ) {
      return result;
    }
  }
  const root = xmlDocument.root;
  if (root === null) {
    return result;
  }
  const topLevelNodes = checkAllAreKnownElements(
    [root],
    ["template", "tool", "namespace", "meta"] as const,
    " at the top level",
    errors,
  );
  if (topLevelNodes.length <= 0) {
    return result;
  }
  const [tag, topLevelNode] = topLevelNodes[0]!;
  switch (tag) {
    case "template": {
      const template = parseTemplate(topLevelNode);
      if (template.kind === "error") {
        errors.push(...template.errors);
      } else {
        result.entity = template;
        result.warnings.push(...template.warnings, ...template.schema.warnings);
      }
      break;
    }
    case "tool": {
      const tool = parseTool(topLevelNode);
      if (tool.kind === "error") {
        errors.push(...tool.errors);
      } else {
        result.entity = tool;
        result.warnings.push(...tool.warnings, ...tool.schema.warnings);
      }
      break;
    }
    case "namespace": {
      const namespace = parseNamespace(topLevelNode);
      if (namespace.kind === "error") {
        errors.push(...namespace.errors);
        result.parseResult.definitionLinks.push(...namespace.definitionLinks);
      } else {
        result.entity = namespace;
        if (namespace.schema.kind === "error") {
          errors.push(...namespace.schema.errors);
        }
        result.warnings.push(...namespace.warnings);
      }
      break;
    }
    case "meta": {
      const meta = parseMeta(topLevelNode);
      if (meta.kind === "error") {
        errors.push(...meta.errors);
        result.parseResult.definitionLinks.push(...meta.definitionLinks);
      } else {
        result.entity = meta;
        if (meta.schema.kind === "error") {
          errors.push(...meta.schema.errors);
        }
        result.warnings.push(...meta.warnings);
      }
      break;
    }
  }

  if (result.entity && errors.length <= 0) {
    result.hash = computeSourceFileHash(path, result.entity);
  }

  if (options.patchBase && errors.length <= 0) {
    const baseFile = options.patchBase.sourceFiles[path];
    if (baseFile) {
      errors.push(...validateAgainstPatch(result, baseFile, root));
    } else {
      errors.push({
        message: "File not found in patch base",
        span: { path, start: 0, end: 0 },
      });
    }
  }

  return result;
}

function computeSourceFileHash(
  path: string,
  entity: Template | Tool | Namespace | Meta,
): number {
  switch (entity.kind) {
    case "template": {
      return combineHashes([
        hashString(path),
        hashString(entity.kind),
        hashString(entity.name.text),
        hashString(entity.namespace?.text ?? DEFAULT_NAMESPACE),
        hashSchema(entity.schema.typeDeclarations),
        hashString(entity.outputFormat?.text ?? "json"),
      ]);
    }
    case "tool": {
      return combineHashes([
        hashString(path),
        hashString(entity.kind),
        hashString(entity.name.text),
        hashString(entity.namespace?.text ?? DEFAULT_NAMESPACE),
        hashSchema(entity.schema.typeDeclarations),
      ]);
    }
    case "namespace": {
      return combineHashes([
        hashString(path),
        hashString(entity.kind),
        hashString(entity.name.text),
        hashSchema((entity.schema as Schema).typeDeclarations),
      ]);
    }
    case "meta": {
      return combineHashes([
        hashString(path),
        hashString(entity.kind),
        hashSchema((entity.schema as Schema).typeDeclarations),
      ]);
    }
  }
}

function validateAgainstPatch(
  override: SourceFileParseResult,
  base: SourceFileParseResult,
  root: ElementNode,
): InternalError[] {
  if (!override.entity || !base.entity) return [];
  const baseEntity = base.entity;
  const { kind } = baseEntity;
  if (override.entity.kind !== kind) {
    return [
      {
        span: root.tag,
        message: `Expected <${kind}> to match base`,
        suggestions: [kind],
      },
    ];
  }
  const errors: InternalError[] = [];
  const checkName = (override: TextSpan, base: TextSpan): void => {
    if (override.text === base.text) return;
    errors.push({
      span: override,
      message: `Expected '${base.text}' to match base`,
      suggestions: [base.text],
    });
  };
  const checkNamespace = (
    override: TextSpan | null,
    base: TextSpan | null,
  ): void => {
    const expected: string = base?.text ?? DEFAULT_NAMESPACE;
    if ((override?.text ?? DEFAULT_NAMESPACE) === expected) return;
    if (override) {
      errors.push({
        span: override,
        message: `Expected '${expected}' to match base`,
        suggestions: [expected],
      });
    } else {
      errors.push({
        span: root.tag,
        message: `Missing attribute 'namespace="${expected}"' to match base`,
      });
    }
  };
  const { path } = override;
  const checkSchema = (override: SchemaLike, base: SchemaLike): void => {
    if (schemasAreEquivalent(override.typeDeclarations, base.typeDeclarations))
      return;
    errors.push({
      message: "Schema does not match base",
      span: { ...override.source, path },
      baseSchema: base.source.text,
    });
  };
  switch (kind) {
    case "template":
    case "tool": {
      const overrideEntity = override.entity as Template | Tool;
      checkName(overrideEntity.name, baseEntity.name);
      checkNamespace(overrideEntity.namespace, baseEntity.namespace);
      checkSchema(overrideEntity.schema, baseEntity.schema);
      break;
    }
    case "namespace": {
      const overrideEntity = override.entity as Namespace;
      checkName(overrideEntity.name, baseEntity.name);
      checkSchema(overrideEntity.schema as Schema, baseEntity.schema as Schema);
      break;
    }
    case "meta": {
      const overrideEntity = override.entity as Meta;
      checkSchema(overrideEntity.schema as Schema, baseEntity.schema as Schema);
      break;
    }
  }
  return errors;
}

type SchemaLike = {
  readonly typeDeclarations: TypeDeclarations;
  readonly source: Omit<TextSpan, "path">;
};

class SourceFileParseResultImpl implements SourceFileParseResult {
  constructor(
    readonly path: string,
    readonly content: string,
    readonly xmlDocument: XmlDocument | InternalErrors,
  ) {
    this.lineFinder = createLineFinder(content);
  }

  hash: number = 0;
  readonly lineFinder: LineFinderData;
  entity: Template | Tool | Namespace | Meta | undefined;

  readonly parseResult = new ValidationResultBuilder();
  readonly warnings: InternalError[] = [];
}

type Sourced<T> = {
  readonly element: T;
  readonly sourceFile: SourceFileParseResult;
  /** True if the source file was copied from the cache. */
  readonly cached: boolean;
};

type NamespaceResultImpl = NamespaceResult & {
  readonly tools: { [name: string]: ToolValidationResult };
  readonly templates: TemplateValidationResult[];
  /** To find conflicts. */
  readonly names: TextSpan[];
};

class CompilationResultImpl implements CompilationResult {
  readonly sourceFiles: { [path: string]: SourceFileParseResult } = {};
  metaSchema: SchemaOrError = EMPTY_SCHEMA;
  readonly namespaces: { [name: string]: NamespaceResultImpl } = {};
  singleNamespace: NamespaceResultImpl | null = null;
  readonly templates: { [id: string]: TemplateValidationResult } = {};
  readonly tools: { [id: string]: ToolValidationResult } = {};
  readonly patchBase: ValidCompilationResult | null;
  readonly edition = 0;
  signature: string | undefined;
  readonly finalErrors: { [path: string]: InternalError[] } = {};
  anyErrors = false;
  readonly warnings: { [path: string]: InternalError[] } = {};
  readonly pathToDefinitionLinks: { [path: string]: DefinitionLink[] } = {};

  constructor(options: { readonly patchBase: ValidCompilationResult | null }) {
    this.patchBase = options.patchBase;
  }

  validate(cache: CompilationResult | null): void {
    const metas: Array<Sourced<Meta>> = [];
    const namespaces: Array<Sourced<Namespace>> = [];
    const templates: Array<Sourced<Template>> = [];
    const tools: Array<Sourced<Tool>> = [];
    for (const sourceFile of Object.values(this.sourceFiles)) {
      const cached = cache?.sourceFiles[sourceFile.path] === sourceFile;
      const source = <T>(element: T): Sourced<T> => ({
        element,
        sourceFile,
        cached,
      });
      switch (sourceFile.entity?.kind) {
        case "meta":
          metas.push(source(sourceFile.entity));
          break;
        case "namespace":
          namespaces.push(source(sourceFile.entity));
          break;
        case "template":
          templates.push(source(sourceFile.entity));
          break;
        case "tool":
          tools.push(source(sourceFile.entity));
          break;
        case undefined:
          break;
        default:
          throw new Error(sourceFile.entity satisfies never);
      }
      const { path, warnings } = sourceFile;
      const { definitionLinks, errors } = sourceFile.parseResult;
      this.finalErrors[path] = [...errors];
      this.warnings[path] = [...warnings];
      this.pathToDefinitionLinks[path] = [...definitionLinks];
    }

    this.resolveMeta(metas);
    this.resolveNamespaces(namespaces);
    this.resolveTools(tools, cache);
    this.resolveTemplates(templates, cache);
    this.checkNameConflictsWithinNamespaces();

    {
      // Remove the default namespace if it doesn't contain any schema,
      // templates or tools.
      const defaultNamespace = this.namespaces[DEFAULT_NAMESPACE]!;
      const isEmpty =
        defaultNamespace.schema.kind === "success" &&
        defaultNamespace.templates.length <= 0 &&
        Object.keys(defaultNamespace.tools).length <= 0 &&
        Object.keys(defaultNamespace.names).length <= 0;
      if (isEmpty) {
        delete this.namespaces[DEFAULT_NAMESPACE];
      }
    }

    const namespaceResults = Object.values(this.namespaces);
    if (namespaceResults.length === 1) {
      const singleNamespace = namespaceResults[0]!;
      if (singleNamespace.name === DEFAULT_NAMESPACE) {
        this.singleNamespace = singleNamespace;
      }
    }

    this.anyErrors = Object.values(this.finalErrors).some(
      (errors) => errors.length >= 1,
    );

    if (!this.anyErrors) {
      this.signature = (
        combineHashesUnordered(
          Object.values(this.sourceFiles).map((s) => s.hash),
        ) >>> 0
      )
        .toString(16)
        .padStart(8, "0");
    }
  }

  private resolveMeta(metas: ReadonlyArray<Sourced<Meta>>): void {
    if (metas.length <= 0) {
      this.metaSchema = EMPTY_SCHEMA;
    } else if (metas.length === 1) {
      const meta = metas[0]!;
      const metaSchema = meta.element.schema ?? EMPTY_SCHEMA;
      this.metaSchema = metaSchema;
      this.pushDefinitionLinks(
        meta.sourceFile.path,
        metaSchema.definitionLinks,
      );
    } else {
      // Multiple <meta> elements found. This is an error.
      for (const meta of metas) {
        this.pushFinalError(meta.sourceFile.path, {
          span: meta.element.tag,
          message: "Multiple <meta> elements found",
        });
      }
      this.metaSchema = { kind: "other-error", definitionLinks: [] };
    }
  }

  private resolveNamespaces(
    namespaces: ReadonlyArray<Sourced<Namespace>>,
  ): void {
    // Organize namespaces by name.
    const namespacesByName: { [name: string]: Sourced<Namespace>[] } = {};
    for (const namespace of namespaces) {
      const name = namespace.element.name.text;
      (namespacesByName[name] ??= []).push(namespace);
    }

    for (const [name, namespaces] of Object.entries(namespacesByName)) {
      if (namespaces.length === 1) {
        const namespace = namespaces[0]!;
        this.namespaces[name] = {
          name: name,
          schema: namespace.element.schema,
          tools: {},
          templates: [],
          names: [],
        };
        const { path } = namespace.sourceFile;
        this.pushDefinitionLinks(
          path,
          namespace.element.schema.definitionLinks,
        );
      } else {
        // Multiple namespaces with the same name found. This is an error.
        this.namespaces[name] = {
          name: name,
          schema: { kind: "other-error", definitionLinks: [] },
          tools: {},
          templates: [],
          names: [],
        };
        // Errors will be pushed to the finalErrors map below.
      }
    }

    this.namespaces[DEFAULT_NAMESPACE] ??= {
      name: DEFAULT_NAMESPACE,
      schema: EMPTY_SCHEMA,
      tools: {},
      templates: [],
      names: [],
    };

    const nameConflicts = checkNameConflicts(
      Object.values(namespaces).map((n) => n.element.name),
    );
    for (const error of nameConflicts) {
      this.pushFinalError(error.span.path, error);
    }
  }

  private resolveTools(
    tools: ReadonlyArray<Sourced<Tool>>,
    cache: CompilationResult | null,
  ): void {
    const namespaceToTools: { [namespace: string]: Sourced<Tool>[] } = {};
    const idToTools: { [namespace: string]: Sourced<Tool>[] } = {};
    for (const tool of tools) {
      const namespace = tool.element.namespace?.text ?? DEFAULT_NAMESPACE;
      (namespaceToTools[namespace] ??= []).push(tool);
      const id = `${namespace}:${tool.element.name.text}`;
      (idToTools[id] ??= []).push(tool);
    }

    for (const [id, tools] of Object.entries(idToTools)) {
      const tool = tools[0]!;
      const { name } = tool.element;

      const namespaceName = tool.element.namespace?.text ?? DEFAULT_NAMESPACE;
      const namespace = this.namespaces[namespaceName];
      if (!namespace) {
        this.pushFinalError(tool.sourceFile.path, {
          span: tool.element.namespace!,
          message: `Namespace '${namespaceName}' not found`,
          suggestions: Object.keys(this.namespaces),
        });
        continue;
      } else if (namespace.schema.kind !== "success") {
        continue;
      }

      for (const tool of tools) {
        namespace.names.push(tool.element.name);
      }
      if (tools.length > 1) {
        // The error will be reported when we look for name conflicts in each
        // namespace.
        continue;
      }

      let validationResult: ToolValidationResult;
      if (tool.cached && namespace === cache?.namespaces[namespaceName]) {
        // Reuse the cached schema validation result.
        validationResult = cache!.tools[id]!;
      } else {
        validationResult = validateTool({
          tool: tool.element,
          namespaceSchema: namespace.schema,
        });
      }

      this.tools[id] = validationResult;
      namespace.tools[name.text] = validationResult;

      if (validationResult.kind === "error") {
        this.pushFinalErrors(tool.sourceFile.path, validationResult.errors);
      }
      this.pushDefinitionLinks(
        tool.sourceFile.path,
        validationResult.definitionLinks,
      );
    }
  }

  private resolveTemplates(
    templates: ReadonlyArray<Sourced<Template>>,
    cache: CompilationResult | null,
  ): void {
    const namespaceToTemplates: { [namespace: string]: Sourced<Template>[] } =
      {};
    const idToTemplates: { [namespace: string]: Sourced<Template>[] } = {};
    for (const template of templates) {
      const namespace = template.element.namespace?.text ?? DEFAULT_NAMESPACE;
      (namespaceToTemplates[namespace] ??= []).push(template);
      const id = `${namespace}:${template.element.name.text}`;
      (idToTemplates[id] ??= []).push(template);
    }

    for (const [id, templates] of Object.entries(idToTemplates)) {
      const template = templates[0]!;
      const namespaceName =
        template.element.namespace?.text ?? DEFAULT_NAMESPACE;

      const namespace = this.namespaces[namespaceName];
      if (!namespace) {
        this.pushFinalError(template.sourceFile.path, {
          span: template.element.namespace!,
          message: `Namespace '${namespaceName}' not found`,
          suggestions: Object.keys(this.namespaces),
        });
        continue;
      } else if (namespace.schema.kind !== "success") {
        continue;
      }

      for (const template of templates) {
        namespace.names.push(template.element.name);
      }
      if (templates.length > 1) {
        // The error will be reported when we look for name conflicts in each
        // namespace.
        continue;
      }

      const tryGetFromCache = (): TemplateValidationResult | null => {
        if (!template.cached) return null;
        if (this.metaSchema !== cache?.metaSchema) return null;
        const cachedNamespace = cache?.namespaces[namespaceName];
        if (namespace !== cachedNamespace) return null;
        const cached = cache.templates[id]!;
        const templateTools =
          cached.kind === "template" ? cached.tools : cachedNamespace.tools;
        let sameTools: boolean;
        if (cached.kind === "template") {
          // Check if the template's tools have changed.
          sameTools = Object.entries(templateTools).every(
            ([name, templateTool]) =>
              templateTool.tool === namespace.tools[name],
          );
        } else {
          // Check if the namespace tools have changed.
          sameTools =
            Object.entries(namespace.tools).every(
              ([name, tool]) => tool === cachedNamespace.tools[name],
            ) &&
            Object.keys(namespace.tools).length ===
              Object.keys(cachedNamespace.tools).length;
        }
        return sameTools ? cached : null;
      };
      const validationResult =
        tryGetFromCache() ??
        validateTemplate({
          template: template.element,
          metaSchema: this.metaSchema,
          namespaceSchema: namespace.schema,
          namespaceTools: namespace.tools,
        });

      this.templates[id] = validationResult;

      const { path } = template.sourceFile;
      if (validationResult.kind === "template") {
        namespace.templates.push(validationResult);
      } else if (validationResult.kind === "error") {
        this.pushFinalErrors(path, validationResult.errors);
      }
      this.pushDefinitionLinks(path, validationResult.definitionLinks);
    }
  }

  private checkNameConflictsWithinNamespaces(): void {
    for (const namespace of Object.values(this.namespaces)) {
      const nameConflicts = checkNameConflicts(namespace.names);
      for (const error of nameConflicts) {
        this.pushFinalError(error.span.path, error);
      }
    }
  }

  private pushFinalError(path: string, errors: InternalError): void {
    this.finalErrors[path]!.push(errors);
  }
  private pushFinalErrors(
    path: string,
    errors: readonly InternalError[],
  ): void {
    this.finalErrors[path]!.push(...errors);
  }

  private pushDefinitionLinks(
    path: string,
    definitionLinks: readonly DefinitionLink[],
  ): void {
    this.pathToDefinitionLinks[path]!.push(...definitionLinks);
  }
}
